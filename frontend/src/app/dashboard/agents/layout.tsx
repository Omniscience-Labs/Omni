import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent Conversation | Kortix Manus",
  description: "Interactive agent conversation powered by Kortix Manus",
  openGraph: {
    title: "Agent Conversation | Kortix Manus",
    description: "Interactive agent conversation powered by Kortix Manus",
    type: "website",
  },
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 