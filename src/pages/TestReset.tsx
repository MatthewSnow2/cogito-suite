import { useState } from 'react';
import { ResetKnowledge } from '@/components/ResetKnowledge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2 } from 'lucide-react';

const TestReset = () => {
  const [showReset, setShowReset] = useState(false);
  const customGptId = 'b2f0e71f-989f-416a-afcc-2cf52aa54d73';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base Reset Test</CardTitle>
            <CardDescription>
              Test the reset functionality for GPT ID: {customGptId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!showReset ? (
              <Button 
                variant="outline"
                onClick={() => setShowReset(true)}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Show Reset Component
              </Button>
            ) : (
              <ResetKnowledge 
                customGptId={customGptId}
                onReset={() => {
                  console.log('Reset completed!');
                  setShowReset(false);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TestReset;