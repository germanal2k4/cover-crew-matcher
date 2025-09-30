import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin, Phone, Clock } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  address: string;
  coords: any;
  contact_name: string | null;
  contact_phone: string | null;
}

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("name");

      if (error) throw error;
      setBranches(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading branches",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const parseCoords = (coords: string) => {
    const match = coords.match(/POINT\(([^ ]+) ([^ ]+)\)/);
    if (match) {
      return { lon: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Branch Locations</h1>
            <p className="text-sm text-muted-foreground">View all office branches</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => {
            const coords = parseCoords(branch.coords);
            return (
              <Card key={branch.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-start gap-2">
                    <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{branch.name}</span>
                  </CardTitle>
                  <CardDescription>{branch.address}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {coords && (
                    <div className="text-sm text-muted-foreground">
                      <p className="font-mono">
                        {coords.lat.toFixed(4)}°N, {coords.lon.toFixed(4)}°E
                      </p>
                    </div>
                  )}
                  {branch.contact_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Contact: {branch.contact_name}</span>
                    </div>
                  )}
                  {branch.contact_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <a 
                        href={`tel:${branch.contact_phone}`}
                        className="text-primary hover:underline"
                      >
                        {branch.contact_phone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {branches.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Branches Yet</h3>
              <p className="text-muted-foreground">Add branches to manage locations</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
