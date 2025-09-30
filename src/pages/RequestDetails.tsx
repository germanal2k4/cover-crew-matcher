import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, MapPin, Clock, Users, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Candidate {
  id: string;
  substitute_id: string;
  score: number;
  scenario_type: string;
  details_json: any;
  eta_at: string;
  employees: {
    full_name: string;
    role_title: string;
    rating: number;
  };
}

export default function RequestDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchRequest();
    fetchCandidates();
  }, [id]);

  const fetchRequest = async () => {
    try {
      const { data, error } = await supabase
        .from("assignment_requests")
        .select(`
          *,
          branches (name, address, coords)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setRequest(data);
    } catch (error: any) {
      toast({
        title: "Error loading request",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidates = async () => {
    try {
      const { data, error } = await supabase
        .from("assignment_candidates")
        .select(`
          *,
          employees (full_name, role_title, rating)
        `)
        .eq("request_id", id)
        .order("score", { ascending: false });

      if (error) throw error;
      setCandidates(data || []);
    } catch (error: any) {
      console.error("Error loading candidates:", error);
    }
  };

  const runMatching = async () => {
    setMatching(true);
    try {
      // Update status to matching
      await supabase
        .from("assignment_requests")
        .update({ status: "matching" })
        .eq("id", id);

      // Call matching edge function
      const { data, error } = await supabase.functions.invoke("match-substitutes", {
        body: { request_id: id },
      });

      if (error) throw error;

      toast({
        title: "Matching Complete",
        description: `Found ${data.candidates_count} potential candidates`,
      });

      await fetchCandidates();
      await fetchRequest();
    } catch (error: any) {
      toast({
        title: "Matching Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setMatching(false);
    }
  };

  const assignCandidate = async (candidateId: string, substituteId: string) => {
    try {
      const { error } = await supabase.from("assignments").insert({
        request_id: id,
        substitute_id: substituteId,
        status: "pending_approval",
        planned_start_at: request.period_start,
        planned_end_at: request.period_end,
      });

      if (error) throw error;

      await supabase
        .from("assignment_requests")
        .update({ status: "assigned" })
        .eq("id", id);

      toast({
        title: "Assignment Created",
        description: "Assignment is pending approval",
      });

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const defaultCandidates = candidates.filter((c) => c.scenario_type === "default");
  const fastCandidates = candidates.filter((c) => c.scenario_type === "fast");
  const nearCandidates = candidates.filter((c) => c.scenario_type === "near");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Request Details</h1>
            <p className="text-sm text-muted-foreground">{request?.role_title}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{request.role_title}</CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {request.branches.name} - {request.branches.address}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Period: {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Must start by: {new Date(request.must_start_by).toLocaleString()}
                  </div>
                </CardDescription>
              </div>
              <Badge className="text-sm">{request.status}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                <p className="text-lg font-semibold">{request.priority}/10</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Candidate Matching</CardTitle>
                <CardDescription>Find optimal substitute employees</CardDescription>
              </div>
              <Button 
                onClick={runMatching} 
                disabled={matching || request.status === "closed"}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {matching ? "Matching..." : "Run Matching"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {candidates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No candidates yet. Click "Run Matching" to find substitutes.</p>
              </div>
            ) : (
              <Tabs defaultValue="default">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="default">
                    Optimal ({defaultCandidates.length})
                  </TabsTrigger>
                  <TabsTrigger value="fast">
                    Fast ({fastCandidates.length})
                  </TabsTrigger>
                  <TabsTrigger value="near">
                    Nearby ({nearCandidates.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="default">
                  <CandidateTable 
                    candidates={defaultCandidates} 
                    onAssign={assignCandidate}
                    requestStatus={request.status}
                  />
                </TabsContent>
                <TabsContent value="fast">
                  <CandidateTable 
                    candidates={fastCandidates} 
                    onAssign={assignCandidate}
                    requestStatus={request.status}
                  />
                </TabsContent>
                <TabsContent value="near">
                  <CandidateTable 
                    candidates={nearCandidates} 
                    onAssign={assignCandidate}
                    requestStatus={request.status}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function CandidateTable({ 
  candidates, 
  onAssign,
  requestStatus
}: { 
  candidates: Candidate[]; 
  onAssign: (candidateId: string, substituteId: string) => void;
  requestStatus: string;
}) {
  if (candidates.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No candidates found for this scenario.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employee</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Speed</TableHead>
          <TableHead>Logistics</TableHead>
          <TableHead>Load</TableHead>
          <TableHead>ETA</TableHead>
          <TableHead>Cost Est.</TableHead>
          <TableHead>Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.map((candidate) => (
          <TableRow key={candidate.id}>
            <TableCell>
              <div>
                <p className="font-medium">{candidate.employees.full_name}</p>
                <p className="text-sm text-muted-foreground">{candidate.employees.role_title}</p>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="font-semibold">{candidate.score.toFixed(2)}</span>
              </div>
            </TableCell>
            <TableCell>{candidate.details_json.speed_score?.toFixed(2) || "N/A"}</TableCell>
            <TableCell>{candidate.details_json.logistics_score?.toFixed(2) || "N/A"}</TableCell>
            <TableCell>{candidate.details_json.load_score?.toFixed(2) || "N/A"}</TableCell>
            <TableCell>
              {candidate.details_json.eta_hours ? `${candidate.details_json.eta_hours.toFixed(1)}h` : "N/A"}
            </TableCell>
            <TableCell>
              {candidate.details_json.travel_cost ? `₽${candidate.details_json.travel_cost.toFixed(0)}` : "N/A"}
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                onClick={() => onAssign(candidate.id, candidate.substitute_id)}
                disabled={requestStatus !== "matching" && requestStatus !== "open"}
              >
                Assign
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
