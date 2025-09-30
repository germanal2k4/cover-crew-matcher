import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Plus, Clock, MapPin, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Request {
  id: string;
  role_title: string;
  period_start: string;
  period_end: string;
  must_start_by: string;
  priority: number;
  status: string;
  created_at: string;
  branches: {
    name: string;
    address: string;
  };
}

export default function Dashboard() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    checkAuth();
    fetchRequests();
    
    const channel = supabase
      .channel('requests-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assignment_requests'
        },
        () => fetchRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    
    setUserRole(profile?.role || "dispatcher");
  };

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("assignment_requests")
        .select(`
          *,
          branches (name, address)
        `)
        .order("priority", { ascending: false })
        .order("must_start_by", { ascending: true });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading requests",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
      case "matching": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "assigned": return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "closed": return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
      case "canceled": return "bg-red-500/10 text-red-700 dark:text-red-400";
      default: return "bg-gray-500/10 text-gray-700";
    }
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 8) return { label: "Critical", color: "destructive" };
    if (priority >= 6) return { label: "High", color: "default" };
    if (priority >= 4) return { label: "Medium", color: "secondary" };
    return { label: "Low", color: "outline" };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Substitute Management</h1>
            <p className="text-sm text-muted-foreground">Role: {userRole}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/employees")}>
              Employees
            </Button>
            <Button variant="outline" onClick={() => navigate("/branches")}>
              Branches
            </Button>
            {userRole === "admin" && (
              <Button variant="outline" onClick={() => navigate("/settings")}>
                Settings
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold">Assignment Requests</h2>
            <p className="text-muted-foreground mt-1">
              Manage and match substitute employees to open positions
            </p>
          </div>
          {(userRole === "hr" || userRole === "admin") && (
            <Button onClick={() => navigate("/requests/new")}>
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          )}
        </div>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Requests Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first assignment request to get started
              </p>
              {(userRole === "hr" || userRole === "admin") && (
                <Button onClick={() => navigate("/requests/new")}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Request
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {requests.map((request) => {
              const priorityInfo = getPriorityLabel(request.priority);
              return (
                <Card 
                  key={request.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/requests/${request.id}`)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CardTitle className="text-xl">{request.role_title}</CardTitle>
                          <Badge className={getStatusColor(request.status)}>
                            {request.status}
                          </Badge>
                          <Badge variant={priorityInfo.color as any}>
                            {priorityInfo.label}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {request.branches.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Must start: {formatDistanceToNow(new Date(request.must_start_by), { addSuffix: true })}
                          </span>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Period</p>
                        <p className="font-medium">
                          {new Date(request.period_start).toLocaleDateString()} - {new Date(request.period_end).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Created</p>
                        <p className="font-medium">
                          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
