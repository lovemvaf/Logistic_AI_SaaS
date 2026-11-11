import type { Metadata } from "next";
import "./globals.css";
import "../styles/layout-tokens.css"; /* editorial layout tokens — colors kept per portal */
import { AuthProvider } from "@/lib/auth-context";
import AppShell from "@/components/AppShell";
import { ToastHost } from 'ui-components';
import { GoogleOAuthProvider } from "@react-oauth/google";

export const metadata: Metadata = {
  title: "SmartLogi | Admin",
  description: "Platform management console",
};

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-ink antialiased">
        <ToastHost />
        <GoogleOAuthProvider clientId={googleClientId}>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
