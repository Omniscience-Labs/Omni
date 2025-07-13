import { isLocalMode } from "@/lib/config";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";
import { LLMApiKeys } from "@/components/api-keys/llm-api-keys";

export default function LLMKeysPage() {

  return <LLMApiKeys />
}