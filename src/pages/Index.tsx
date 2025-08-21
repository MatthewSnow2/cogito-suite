// This file is not used in the current routing setup
// Authenticated users go to Dashboard via "/" route in App.tsx
// Unauthenticated users are redirected to "/auth" via the ProtectedRoute component

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to GPT Studio</h1>
        <p className="text-xl text-muted-foreground">This page should not be visible. Check routing configuration.</p>
      </div>
    </div>
  );
};

export default Index;
