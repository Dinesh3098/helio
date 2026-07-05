"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage } from "@/lib/api/client";
import { useSignup } from "../hooks";
import { signupSchema, type SignupValues } from "../schemas";

const FIELDS = [
  {
    name: "workspaceName",
    label: "Workspace name",
    type: "text",
    placeholder: "Acme Inc",
    autoComplete: "organization",
  },
  {
    name: "name",
    label: "Full name",
    type: "text",
    placeholder: "Jane Doe",
    autoComplete: "name",
  },
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@company.com",
    autoComplete: "email",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "",
    autoComplete: "new-password",
  },
] as const;

export function SignupForm() {
  const signup = useSignup();
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { workspaceName: "", name: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => signup.mutate(values));

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {signup.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {getApiErrorMessage(signup.error)}
          </AlertDescription>
        </Alert>
      )}

      {FIELDS.map((field) => (
        <div key={field.name} className="grid gap-2">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            type={field.type}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            aria-invalid={!!form.formState.errors[field.name]}
            {...form.register(field.name)}
          />
          {form.formState.errors[field.name] && (
            <p className="text-destructive text-sm" role="alert">
              {form.formState.errors[field.name]?.message}
            </p>
          )}
        </div>
      ))}

      <Button type="submit" disabled={signup.isPending} className="w-full">
        {signup.isPending && <Loader2 className="animate-spin" />}
        Create workspace
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
