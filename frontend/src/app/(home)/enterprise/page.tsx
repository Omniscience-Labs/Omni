'use client';

import { useState } from 'react';
import { FooterSection } from '@/components/home/footer-section';
import { motion } from 'framer-motion';
import { 
  ArrowRight, 
  Check, 
  Clock, 
  Shield, 
  Users, 
  Zap,
  Star,
  Calendar,
  Headphones,
  Settings,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { KortixEnterpriseModal } from '@/components/sidebar/kortix-enterprise-modal';
import { OmniLogo } from '@/components/sidebar/omni-logo';

// Section Header Component
const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="p-8 space-y-4">
      {children}
    </div>
  );
};

// Hero Section Component
const CustomHeroSection = () => {
  return (
    <section className="w-full relative overflow-hidden">
      <div className="relative flex flex-col items-center w-full px-6">
        <div className="relative z-10 pt-32 mx-auto h-full w-full max-w-6xl flex flex-col items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-6 max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-medium tracking-tighter text-balance text-center">
              <span className="text-primary">Enterprise AI workers delivered in days</span>
            </h1>
            
            <p className="text-lg md:text-xl text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight max-w-3xl">
              Skip the learning curve. Our AI specialists design, develop and deploy enterprise-grade AI workers that integrate seamlessly with your operations.
            </p>
            
            <div className="flex flex-col items-center gap-6 pt-6">
              <KortixEnterpriseModal>
                <Button size="lg">
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule Strategy Call
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </KortixEnterpriseModal>
              <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>Free consultation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>Custom solution design</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary"></div>
                  <span>Tailored pricing</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Value Proposition Section
const ValuePropSection = () => {
  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              When Standard Solutions Fall Short
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Professional implementation services designed for organizations with unique requirements and mission-critical automation needs.
            </p>
          </SectionHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-border">
            <div className="p-8 border-r border-border">
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-3">Accelerate Time-to-Value</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Bypass months of development cycles. Our proven methodology delivers enterprise-ready AI workers in a fraction of the time, letting you focus on strategy instead of implementation.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <div className="space-y-6">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Settings className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-3">Enterprise Integration</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Designed for sophisticated business processes requiring seamless integration with legacy systems, compliance frameworks, and industry-specific requirements.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Implementation Process Section
const ProcessSection = () => {
  const steps = [
    {
      icon: <Users className="w-8 h-8" />,
      title: "Strategic Analysis",
      description: "Solution architects conduct comprehensive business analysis, workflow mapping, and technical requirements gathering to design optimal AI worker architecture for your organization.",
      phase: "Discovery"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Engineering Excellence", 
      description: "Full-stack development with enterprise security, scalability design, comprehensive testing, performance optimization, and seamless integration with existing systems.",
      phase: "Build"
    },
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Enterprise Support",
      description: "Dedicated success management, comprehensive training programs, continuous performance monitoring, optimization services, and satisfaction guarantee with full accountability.",
      phase: "Scale"
    }
  ];

  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              Our Implementation Methodology
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              A proven three-phase approach that transforms your vision into production-ready AI workers
            </p>
          </SectionHeader>

          <div className="border-t border-border">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                className={`flex flex-col md:flex-row gap-8 p-8 ${index !== steps.length - 1 ? 'border-b border-border' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-primary border border-primary/20">
                    {step.icon}
                  </div>
                </div>
                
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-semibold">{step.title}</h3>
                    <span className="px-3 py-1 text-xs font-medium bg-secondary/10 text-secondary rounded-full">
                      {step.phase}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// Enterprise Features Section (9 feature boxes from V2)
const EnterpriseFeaturesSection = () => {
  const enterpriseFeatures = [
    {
      title: "Private AI Training",
      icon: "🔒",
      features: ["Zero Data Leakage", "Proprietary Training", "Competitive Edge", "Domain-Specific AI"],
      description: "Train AI models exclusively on your proprietary data. Create specialized capabilities tailored to your industry while ensuring your competitive insights never leave your organization.",
      gradient: "from-blue-500/10 to-cyan-500/10",
    },
    {
      title: "Zero Trust Security",
      icon: "🛡️",
      features: ["AES-256 Encryption", "Zero-Trust Architecture", "Real-time Monitoring", "Threat Detection"],
      description: "Military-grade security with zero-trust architecture. Every interaction is encrypted with AES-256 standards and continuous threat monitoring.",
      gradient: "from-green-500/10 to-emerald-500/10",
    },
    {
      title: "Data Sovereignty",
      icon: "⚔️",
      features: ["Data Isolation", "Competitor Protection", "IP Safeguarding", "Full Ownership"],
      description: "Protect your market position with isolated AI ecosystems. Your insights, customer intelligence, and strategic data stay exclusively yours.",
      gradient: "from-purple-500/10 to-violet-500/10",
    },
    {
      title: "Identity & Access Management",
      icon: "🔑",
      features: ["Role-Based Access Control", "Single Sign-On (SSO)", "Granular Permissions", "Identity Provider Integration"],
      description: "Comprehensive access control with seamless SSO integration and granular role management to ensure secure access across your organization.",
      gradient: "from-orange-500/10 to-amber-500/10",
    },
    {
      title: "Flexible Deployment",
      icon: "☁️",
      features: ["Single Tenant Cloud", "Virtual Private Cloud", "Hybrid Deployments", "On-Premise Solutions"],
      description: "Deploy Omni in your environment of choice - dedicated cloud resources, your own VPC, hybrid setups, or fully on-premise with all major cloud providers supported.",
      gradient: "from-sky-500/10 to-blue-500/10",
    },
    {
      title: "Custom AI Agents",
      icon: "🤖",
      features: ["Specialized Workflows", "Business Process Integration", "Domain-Specific Training", "Custom Capabilities"],
      description: "Deploy specialized AI agents tailored to your specific business processes and workflows with domain-specific training and custom capabilities.",
      gradient: "from-pink-500/10 to-rose-500/10",
    },
    {
      title: "Enterprise Analytics",
      icon: "📊",
      features: ["Usage Monitoring", "Performance Metrics", "ROI Tracking", "Custom Dashboards"],
      description: "Advanced analytics and reporting tools to monitor usage patterns, track performance metrics, and measure ROI across your organization with custom dashboards.",
      gradient: "from-indigo-500/10 to-purple-500/10",
    },
    {
      title: "Enterprise Credit Plans",
      icon: "💳",
      features: ["Volume Discounts", "Custom Billing", "Usage Patterns", "Flexible Pricing"],
      description: "Flexible credit-based pricing plans designed for enterprise usage patterns with volume discounts, custom billing cycles, and adaptable pricing structures.",
      gradient: "from-teal-500/10 to-cyan-500/10",
    },
    {
      title: "24/7 Enterprise Support",
      icon: "🎯",
      features: ["Dedicated Support", "Guaranteed Response Times", "Senior Engineers", "Priority Access"],
      description: "Round-the-clock dedicated support with guaranteed response times, direct access to senior engineers, and priority technical assistance for your enterprise.",
      gradient: "from-red-500/10 to-orange-500/10",
    },
  ];

  return (
    <section className="flex flex-col items-center justify-center w-full relative py-16 lg:py-20">
      <div className="w-full max-w-7xl mx-auto px-6">
        <SectionHeader>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-center text-balance pb-2">
            Managed Enterprise Deployments
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium max-w-3xl mx-auto">
            Omni offers fully managed Enterprise deployments with advanced security, custom enterprise tooling, and flexible enterprise credit plans.
          </p>
        </SectionHeader>

        <div className="py-10 lg:py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 max-w-7xl mx-auto">
            {enterpriseFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                className={`group relative bg-gradient-to-br ${feature.gradient} dark:from-neutral-900/80 dark:to-neutral-950/80 p-6 lg:p-7 rounded-2xl overflow-hidden border border-border/40 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                viewport={{ once: true }}
              >
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:24px_24px]"></div>
                </div>
                
                <div className="relative z-10">
                  {/* Icon and Title */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-background/80 dark:bg-neutral-800/80 flex items-center justify-center text-xl shadow-sm border border-border/50">
                      {feature.icon}
                    </div>
                    <h3 className="text-base lg:text-lg font-semibold text-foreground">
                      {feature.title}
                    </h3>
                  </div>
                  
                  {/* Features grid */}
                  <div className="mb-4">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      {feature.features.map((item, idx) => (
                        <div key={idx} className="flex items-center">
                          <Check className="w-3.5 h-3.5 text-primary mr-1.5 flex-shrink-0" />
                          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground/80 transition-colors">
                            {item}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// Benefits Section
const BenefitsSection = () => {
  const benefits = [
    "Dedicated solution architect and technical lead for your project",
    "Enterprise-grade AI worker design with scalability considerations",
    "White-glove support with dedicated success manager", 
    "Comprehensive team training and knowledge transfer",
    "Quarterly business reviews and performance optimization",
    "Deep integration with existing technology stack and workflows"
  ];

  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              Enterprise-Grade Implementation
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Premium service tier with dedicated resources and tailored solutions for complex organizational needs
            </p>
          </SectionHeader>

          <div className="border-t border-border p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={index}
                  className="flex items-start gap-3 p-4 rounded-lg hover:bg-accent/20 transition-colors"
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <p className="text-sm font-medium leading-relaxed">{benefit}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Testimonials Section
const TestimonialsSection = () => {
  const testimonials = [
    {
      quote: "The implementation team transformed our entire workflow. Their expertise in enterprise AI deployment is unmatched.",
      author: "Sarah Chen",
      company: "TechFlow Industries",
      avatar: "🚀"
    },
    {
      quote: "ROI was evident within the first month. The AI workers handle our most complex processes flawlessly.",
      author: "Marcus Rodriguez", 
      company: "Global Manufacturing Corp",
      avatar: "💡"
    },
    {
      quote: "Outstanding technical depth and business understanding. They delivered exactly what we envisioned.",
      author: "Dr. Amanda Foster",
      company: "Research Dynamics LLC",
      avatar: "⭐"
    },
    {
      quote: "Professional, reliable, and innovative. The custom solution exceeded our expectations completely.",
      author: "James Wellington",
      company: "Strategic Ventures Group", 
      avatar: "🎯"
    }
  ];

  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              Client Success Stories
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Organizations that have transformed their operations with our enterprise implementation services
            </p>
          </SectionHeader>

          <div className="border-t border-border">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  className={`p-8 ${index % 2 === 0 ? 'md:border-r border-border' : ''} ${index < 2 ? 'border-b border-border' : ''}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                      ))}
                    </div>
                    
                    <blockquote className="text-lg font-medium leading-relaxed">
                      "{testimonial.quote}"
                    </blockquote>
                    
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-lg">
                        {testimonial.avatar}
                      </div>
                      <div>
                        <p className="font-semibold">{testimonial.author}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.company}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Self-Service Alternative Section
const SelfServiceSection = () => {
  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              Self-Service Alternative
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Explore our platform independently with comprehensive resources and community support
            </p>
          </SectionHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 border-t border-border">
            <div className="p-8 border-r border-border space-y-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">Learning Center</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Master AI worker development through structured courses, detailed documentation, and hands-on tutorials.
                </p>
                <Button variant="outline" className="rounded-full">
                  Start Learning
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <Headphones className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3">Developer Community</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Connect with engineers, solution architects, and other professionals building enterprise AI solutions.
                </p>
                <Button variant="outline" className="rounded-full">
                  Join Community
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Final CTA Section
const FinalCTASection = () => {
  return (
    <section className="flex flex-col items-center justify-center w-full relative">
      <div className="relative w-full px-6">
        <div className="max-w-6xl mx-auto border-l border-r border-border">
          <SectionHeader>
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              Ready to Transform Your Operations?
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Let's discuss your specific requirements and design a custom AI implementation strategy for your organization.
            </p>
          </SectionHeader>

          <div className="border-t border-border p-8">
            <div className="text-center space-y-6">
              <div className="space-y-4">
                <div className="space-y-6">
                  <KortixEnterpriseModal>
                    <Button size="lg">
                      <Calendar className="w-4 h-4 mr-2" />
                      Book Your Strategy Session
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </KortixEnterpriseModal>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center max-w-2xl mx-auto">
                    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-accent/20">
                      <Shield className="w-6 h-6 text-primary" />
                      <span className="text-sm font-medium">100% Satisfaction</span>
                      <span className="text-xs text-muted-foreground">Guarantee</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-accent/20">
                      <Users className="w-6 h-6 text-primary" />
                      <span className="text-sm font-medium">Enterprise Support</span>
                      <span className="text-xs text-muted-foreground">Dedicated team</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-accent/20">
                      <Settings className="w-6 h-6 text-primary" />
                      <span className="text-sm font-medium">Custom Pricing</span>
                      <span className="text-xs text-muted-foreground">Tailored to needs</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// Main Page Component
export default function CustomImplementationPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen w-full">
      <div className="w-full divide-y divide-border">
        <CustomHeroSection />
        <EnterpriseFeaturesSection />
        <ProcessSection />
        <FinalCTASection />
        <FooterSection />
      </div>
    </main>
  );
}
