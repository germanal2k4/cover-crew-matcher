import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LogisticsResult {
  mode: string;
  eta_hours: number;
  cost_est: number;
  distance_km: number;
}

// Haversine formula to calculate distance between two coordinates
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateLogistics(fromCoords: [number, number], toCoords: [number, number], rules: any): LogisticsResult {
  const distance = haversineDistance(fromCoords[1], fromCoords[0], toCoords[1], toCoords[0]);
  
  let mode = "car";
  let speed_kmh = rules.car_speed_kmh;
  let base_cost = rules.car_base_cost;
  let cost_per_km = rules.car_cost_per_km;

  if (distance > rules.air_threshold_km) {
    mode = "air";
    speed_kmh = rules.air_speed_kmh;
    base_cost = rules.air_base_cost;
    cost_per_km = rules.air_cost_per_km;
  } else if (distance > rules.rail_threshold_km) {
    mode = "rail";
    speed_kmh = rules.rail_speed_kmh;
    base_cost = rules.rail_base_cost;
    cost_per_km = rules.rail_cost_per_km;
  }

  const eta_hours = distance / speed_kmh;
  const cost_est = base_cost + (distance * cost_per_km);

  return { mode, eta_hours, cost_est, distance_km: distance };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { request_id } = await req.json();

    // Fetch request details
    const { data: request, error: requestError } = await supabase
      .from('assignment_requests')
      .select('*, branches (*)')
      .eq('id', request_id)
      .single();

    if (requestError) throw requestError;

    // Fetch active substitutes
    const { data: substitutes, error: substitutesError } = await supabase
      .from('substitute_profiles')
      .select('*, employees (*)')
      .eq('active', true);

    if (substitutesError) throw substitutesError;

    // Fetch logistics rules and scoring weights
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .in('key', ['logistics_rules', 'scoring_weights', 'scoring_weights_fast', 'scoring_weights_near']);

    const logisticsRules = settings?.find(s => s.key === 'logistics_rules')?.value_json || {};
    const defaultWeights = settings?.find(s => s.key === 'scoring_weights')?.value_json || { speed: 0.4, logistics: 0.35, load: 0.25 };
    const fastWeights = settings?.find(s => s.key === 'scoring_weights_fast')?.value_json || { speed: 0.5, logistics: 0.35, load: 0.15 };
    const nearWeights = settings?.find(s => s.key === 'scoring_weights_near')?.value_json || { speed: 0.25, logistics: 0.6, load: 0.15 };

    // Parse branch coordinates
    const branchCoordsMatch = request.branches.coords.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    const branchCoords: [number, number] = branchCoordsMatch 
      ? [parseFloat(branchCoordsMatch[1]), parseFloat(branchCoordsMatch[2])]
      : [0, 0];

    // Calculate candidates for each scenario
    const scenarios = [
      { type: 'default', weights: defaultWeights },
      { type: 'fast', weights: fastWeights },
      { type: 'near', weights: nearWeights },
    ];

    const allCandidates = [];

    for (const scenario of scenarios) {
      const candidates = [];

      for (const substitute of substitutes) {
        // Parse substitute coordinates
        const subCoordsMatch = substitute.base_coords.match(/POINT\(([^ ]+) ([^ ]+)\)/);
        const subCoords: [number, number] = subCoordsMatch
          ? [parseFloat(subCoordsMatch[1]), parseFloat(subCoordsMatch[2])]
          : [0, 0];

        // Calculate logistics
        const logistics = calculateLogistics(subCoords, branchCoords, logisticsRules);

        // Calculate speed score (based on how soon they can start)
        const mustStartBy = new Date(request.must_start_by);
        const periodStart = new Date(request.period_start);
        const hoursUntilStart = (mustStartBy.getTime() - Date.now()) / (1000 * 60 * 60);
        const speedScore = Math.max(0, Math.min(100, (hoursUntilStart / (24 * 7)) * 100));

        // Calculate logistics score (normalized)
        const logisticsScore = Math.max(0, 100 - (logistics.eta_hours / 24) * 50 - (logistics.cost_est / 10000) * 50);

        // Calculate load score (count recent assignments)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { count: recentAssignments } = await supabase
          .from('assignments')
          .select('id', { count: 'exact', head: true })
          .eq('substitute_id', substitute.employee_id)
          .gte('created_at', thirtyDaysAgo.toISOString());

        const loadScore = Math.max(0, 100 - (recentAssignments || 0) * 25);

        // Calculate final score
        const score = 
          speedScore * scenario.weights.speed +
          logisticsScore * scenario.weights.logistics +
          loadScore * scenario.weights.load;

        candidates.push({
          request_id,
          substitute_id: substitute.employee_id,
          score,
          scenario_type: scenario.type,
          details_json: {
            speed_score: speedScore,
            logistics_score: logisticsScore,
            load_score: loadScore,
            eta_hours: logistics.eta_hours,
            travel_cost: logistics.cost_est,
            travel_mode: logistics.mode,
            distance_km: logistics.distance_km,
            recent_assignments: recentAssignments || 0,
            explanation: `Speed: ${speedScore.toFixed(1)}, Logistics: ${logisticsScore.toFixed(1)}, Load: ${loadScore.toFixed(1)}`,
            weights: scenario.weights,
          },
          logistics_json: logistics,
        });
      }

      // Sort and take top 5 for this scenario
      candidates.sort((a, b) => b.score - a.score);
      allCandidates.push(...candidates.slice(0, 5));
    }

    // Delete old candidates for this request
    await supabase
      .from('assignment_candidates')
      .delete()
      .eq('request_id', request_id);

    // Insert new candidates
    if (allCandidates.length > 0) {
      const { error: insertError } = await supabase
        .from('assignment_candidates')
        .insert(allCandidates);

      if (insertError) throw insertError;
    }

    // Update request status
    await supabase
      .from('assignment_requests')
      .update({ status: 'matching' })
      .eq('id', request_id);

    return new Response(
      JSON.stringify({
        success: true,
        candidates_count: allCandidates.length,
        scenarios: scenarios.map(s => s.type),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in match-substitutes:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
