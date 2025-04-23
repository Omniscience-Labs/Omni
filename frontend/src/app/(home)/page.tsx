"use client";

import { useEffect, useState } from "react";
import { CTASection } from "@/components/home/sections/cta-section";
// import { FAQSection } from "@/components/sections/faq-section";
import { FooterSection } from "@/components/home/sections/footer-section";
import { HeroSection } from "@/components/home/sections/hero-section";
import { OpenSourceSection } from "@/components/home/sections/open-source-section";
import { PricingSection } from "@/components/home/sections/pricing-section";
import { UseCasesSection } from "@/components/home/sections/use-cases-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Home() {
  const [showSystemIssuesAlert, setShowSystemIssuesAlert] = useState(false);
  
  useEffect(() => {
    // Show the system issues alert when component mounts
    setShowSystemIssuesAlert(true);
  }, []);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen w-full">
      <div className="w-full divide-y divide-border">
        <HeroSection />
        <UseCasesSection />
        {/* <CompanyShowcase /> */}
        {/* <BentoSection /> */}
        {/* <QuoteSection /> */}
        {/* <FeatureSection /> */}
        {/* <GrowthSection /> */}
        <OpenSourceSection />
        <PricingSection />
        {/* <TestimonialSection /> */}
        {/* <FAQSection /> */}
        <CTASection />
        <FooterSection />
      </div>
      
      <AlertDialog open={showSystemIssuesAlert} onOpenChange={setShowSystemIssuesAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>System Issues</AlertDialogTitle>
            <AlertDialogDescription>
              We're currently experiencing technical issues with our service. Please come back in a couple of hours when the system will be operational again. We apologize for the inconvenience.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Understood</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
} 