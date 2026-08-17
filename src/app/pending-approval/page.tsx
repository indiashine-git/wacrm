import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PendingApprovalPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Account pending approval</CardTitle>
          <CardDescription>
            Your account has been created and is awaiting approval. You&apos;ll
            be able to sign in as soon as it&apos;s reviewed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          If this is taking longer than expected, contact the person who
          invited you to this workspace.
        </CardContent>
      </Card>
    </div>
  );
}
