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
import { useLogin } from "../hooks";
import { loginSchema, type LoginValues } from "../schemas";

export function LoginForm() {
  const login = useLogin();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => login.mutate(values));

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {login.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {getApiErrorMessage(login.error)}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!form.formState.errors.password}
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p className="text-destructive text-sm" role="alert">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={login.isPending} className="w-full">
        {login.isPending && <Loader2 className="animate-spin" />}
        Sign in
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        No account yet?{" "}
        <Link href="/signup" className="text-foreground underline">
          Create a workspace
        </Link>
      </p>
    </form>
  );
}
