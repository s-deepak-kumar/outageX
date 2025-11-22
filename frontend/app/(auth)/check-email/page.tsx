import { redirect } from "next/navigation";
import Link from "next/link";
import Balancer from "react-wrap-balancer";

export default async function LoginPage() {
  return (
    <section className="flex fixed top-0 right-0 left-0 h-screen w-screen overflow-hidden flex-col items-center justify-center bg-background/20 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-lg border p-6 shadow-sm md:p-12 mt-12 bg-muted">
        <h1 className="text-4xl font-bold text-foreground mb-4">OutageX</h1>
        <p className="text-center">Check your email!</p>

        <div className="flex flex-col items-center gap-4">
          <p className="text-sm opacity-70">
            <Balancer>
              A sign in link has been sent to your email address.
            </Balancer>
          </p>
        </div>
      </div>

      <p className="mt-4 max-w-xs text-center text-sm opacity-60 md:mb-24">
        By using OutageX, you agree to our{" "}
        <Link className="underline underline-offset-4" href="/">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link className="underline underline-offset-4" href="/">
          Terms of Service
        </Link>
        .
      </p>
    </section>
  );
}
