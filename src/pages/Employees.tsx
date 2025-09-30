import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, UserCheck, Users as UsersIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Employee {
  id: string;
  full_name: string;
  tab_number: string;
  role_title: string;
  is_substitute: boolean;
  rating: number;
  substitute_profiles?: any;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "substitute" | "regular">("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchEmployees();
  }, [filter]);

  const fetchEmployees = async () => {
    try {
      let query = supabase
        .from("employees")
        .select(`
          *,
          substitute_profiles (base_region, active)
        `)
        .order("full_name");

      if (filter === "substitute") {
        query = query.eq("is_substitute", true);
      } else if (filter === "regular") {
        query = query.eq("is_substitute", false);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmployees(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading employees",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = employees.filter((emp) =>
    emp.full_name.toLowerCase().includes(search.toLowerCase()) ||
    emp.tab_number.toLowerCase().includes(search.toLowerCase()) ||
    emp.role_title.toLowerCase().includes(search.toLowerCase())
  );

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
            <h1 className="text-xl font-bold">Employee Management</h1>
            <p className="text-sm text-muted-foreground">View all employees and substitutes</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="w-5 h-5" />
                Employees ({filteredEmployees.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  All
                </Button>
                <Button 
                  variant={filter === "substitute" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("substitute")}
                >
                  Substitutes
                </Button>
                <Button 
                  variant={filter === "regular" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("regular")}
                >
                  Regular
                </Button>
              </div>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID, or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <UsersIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No employees found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tab Number</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="font-mono text-sm">
                          {employee.tab_number}
                        </TableCell>
                        <TableCell className="font-medium">
                          {employee.full_name}
                        </TableCell>
                        <TableCell>{employee.role_title}</TableCell>
                        <TableCell>
                          {employee.is_substitute ? (
                            <Badge variant="default" className="gap-1">
                              <UserCheck className="w-3 h-3" />
                              Substitute
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Regular</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">{employee.rating?.toFixed(1) || "N/A"}</span>
                            <span className="text-muted-foreground text-sm">/5.0</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {employee.substitute_profiles?.[0]?.base_region || "—"}
                        </TableCell>
                        <TableCell>
                          {employee.is_substitute && (
                            <Badge variant={employee.substitute_profiles?.[0]?.active ? "default" : "outline"}>
                              {employee.substitute_profiles?.[0]?.active ? "Active" : "Inactive"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
