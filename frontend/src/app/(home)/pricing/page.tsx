'use client';

import { FooterSection } from '@/components/home/footer-section';
import { motion } from 'framer-motion';
import { CheckIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const pricingPlans = [
  {
    name: 'Starter',
    price: '$0',
    yearlyPrice: '$0',
    description: 'Perfect for trying out Omni',
    hours: '1 hour',
    features: [
      '1 hour of AI worker time per month',
      'Access to all basic features',
      'Community support',
      'Basic integrations',
    ],
    buttonText: 'Get Started Free',
    buttonVariant: 'outline' as const,
    href: '/auth',
  },
  {
    name: 'Pro',
    price: '$20',
    yearlyPrice: '$17',
    description: 'For individuals and small teams',
    hours: '10 hours',
    features: [
      '10 hours of AI worker time per month',
      'Priority task execution',
      'Advanced integrations',
      'Email support',
      'Custom AI worker training',
    ],
    buttonText: 'Start Pro Plan',
    buttonVariant: 'default' as const,
    isPopular: true,
    href: '/auth',
  },
  {
    name: 'Business',
    price: '$50',
    yearlyPrice: '$43',
    description: 'For growing businesses',
    hours: '30 hours',
    features: [
      '30 hours of AI worker time per month',
      'Dedicated support',
      'Advanced analytics',
      'Team collaboration',
      'API access',
      'Custom workflows',
    ],
    buttonText: 'Start Business Plan',
    buttonVariant: 'default' as const,
    href: '/auth',
  },
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');

  return (
    <main className="flex flex-col items-center justify-center min-h-screen w-full">
      <div className="w-full">
        {/* Hero Section */}
        <section className="w-full relative overflow-hidden pt-32 pb-16">
          <div className="relative flex flex-col items-center w-full px-6">
            <div className="max-w-4xl mx-auto text-center">
              <motion.h1 
                className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tighter text-balance mb-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                Choose the right plan for your needs
              </motion.h1>
              <motion.p 
                className="text-lg md:text-xl text-muted-foreground font-medium text-balance leading-relaxed max-w-2xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                Start with our free plan or upgrade to a premium plan for more usage hours
              </motion.p>
            </div>
          </div>
        </section>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="relative flex w-fit items-center rounded-full border p-1 backdrop-blur-sm bg-muted">
            {(['monthly', 'yearly'] as const).map((period) => (
              <button
                key={period}
                onClick={() => setBillingPeriod(period)}
                className={cn(
                  'relative z-[1] px-6 py-2 flex items-center justify-center cursor-pointer rounded-full text-sm font-medium transition-all duration-200',
                  billingPeriod === period
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {period === 'monthly' ? 'Monthly' : 'Yearly (Save 17%)'}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Cards */}
        <section className="w-full px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {pricingPlans.map((plan, index) => (
                <motion.div
                  key={plan.name}
                  className={cn(
                    "relative rounded-2xl p-8 backdrop-blur-sm border transition-all duration-300 hover:scale-[1.02] flex flex-col",
                    plan.isPopular
                      ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
                      : "border-border/50 bg-background/30 hover:border-border/70"
                  )}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                >
                  {/* Popular Badge */}
                  {plan.isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-medium shadow-lg">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Plan Header */}
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-semibold mb-2">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                    <div className="flex items-baseline justify-center">
                      <span className="text-4xl font-bold">
                        {billingPeriod === 'yearly' ? plan.yearlyPrice : plan.price}
                      </span>
                      <span className="text-muted-foreground ml-2">/month</span>
                    </div>
                    {billingPeriod === 'yearly' && plan.price !== '$0' && (
                      <div className="text-sm text-muted-foreground mt-1">
                        <span className="line-through">{plan.price}</span>
                        <span className="ml-2 text-primary">Save 17%</span>
                      </div>
                    )}
                    <div className="mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold bg-primary/10 border-primary/20 text-primary">
                      {plan.hours}/month
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-4 mb-8 flex-grow">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 mr-3">
                          <CheckIcon className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Button */}
                  <div className="mt-auto">
                    <Link href={plan.href}>
                      <Button 
                        variant={plan.buttonVariant}
                        className={cn(
                          "w-full h-12 text-base font-medium rounded-full transition-all duration-200",
                          plan.isPopular && "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/25"
                        )}
                      >
                        {plan.buttonText}
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Enterprise CTA */}
        <section className="w-full px-6 pb-20">
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 to-secondary/5 p-8 md:p-12 text-center">
              <h2 className="text-2xl md:text-3xl font-semibold mb-4">Need more? Go Enterprise</h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                Get custom AI workers, dedicated support, and tailored solutions for your organization's unique needs.
              </p>
              <Link href="/enterprise">
                <Button size="lg" className="rounded-full px-8">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <FooterSection />
      </div>
    </main>
  );
}
