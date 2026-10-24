import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { EmptyConnect } from "@/components/empty-connect";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrainingWorkspace } from "@/components/training/training-workspace";
import { useConnection } from "@/lib/chess/hooks";
const RepertoireTraining = lazy(() =>
  import("@/components/training/repertoire-training").then((m) => ({
    default: m.RepertoireTraining,
  })),
);
export const Route = createFileRoute("/app/train")({
  head: () => ({ meta: [{ title: "Training - NeverPay4Chess" }] }),
  component: TrainPage,
});
function TrainPage() {
  const connection = useConnection();
  if (!connection)
    return (
      <div className="app-page">
        <EmptyConnect
          title="Your next 1,000 steps forward"
          description="Connect your chess account for a personal collection of tactics. Train for one hour a day, and revisit the patterns you miss."
        />
      </div>
    );
  const accountKey = `${connection.platform}:${connection.username.toLowerCase()}`;
  return (
    <Tabs defaultValue="tactics" className="pb-4">
      <div className="px-4 pt-6 md:px-8">
        <TabsList aria-label="Training type">
          <TabsTrigger value="tactics">Personal tactics</TabsTrigger>
          <TabsTrigger value="repertoire">Repertoire review</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="tactics">
        <TrainingWorkspace key={accountKey} connection={connection} accountKey={accountKey} />
      </TabsContent>
      <TabsContent value="repertoire">
        <Suspense fallback={<p className="app-page">Loading repertoire…</p>}>
          <RepertoireTraining />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
