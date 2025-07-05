'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Bot,
  Briefcase,
  Settings,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Users,
  Shield,
  Zap,
  Target,
  Brain,
  Globe,
  Heart,
  PenTool,
  Code,
  Camera,
  Calendar,
  DollarSign,
  Rocket,
} from 'lucide-react';

type PromptExample = {
  title: string;
  query: string;
  icon: React.ReactNode;
};

const allPrompts: PromptExample[] = [
  {
    title: 'Market research dashboard',
    query: 'Create a comprehensive market research dashboard analyzing industry trends, customer segments, and competitive landscape. Include data visualization and actionable recommendations.',
    icon: <BarChart3 className="text-green-700 dark:text-green-400" size={16} />,
  },
  {
    title: 'Recommendation engine',
    query: 'Develop a recommendation engine for personalized product suggestions. Include collaborative filtering, content-based filtering, and hybrid approaches with evaluation metrics.',
    icon: <Bot className="text-blue-700 dark:text-blue-400" size={16} />,
  },
  {
    title: 'Go-to-market strategy',
    query: 'Develop a comprehensive go-to-market strategy for a new product. Include market sizing, customer acquisition channels, pricing strategy, and launch timeline.',
    icon: <Briefcase className="text-rose-700 dark:text-rose-400" size={16} />,
  },
  {
    title: 'Data pipeline automation',
    query: 'Create an automated data pipeline for ETL processes. Include data validation, error handling, monitoring, and scalable architecture design.',
    icon: <Settings className="text-purple-700 dark:text-purple-400" size={16} />,
  },
  {
    title: 'Productivity system',
    query: 'Design a comprehensive personal productivity system including task management, goal tracking, habit formation, and time blocking. Create templates and workflows for daily, weekly, and monthly planning.',
    icon: <Target className="text-orange-700 dark:text-orange-400" size={16} />,
  },
  {
    title: 'Content marketing plan',
    query: 'Develop a 6-month content marketing strategy including blog posts, social media, email campaigns, and SEO optimization. Include content calendar and performance metrics.',
    icon: <PenTool className="text-indigo-700 dark:text-indigo-400" size={16} />,
  },
  {
    title: 'Portfolio analysis',
    query: 'Create a personal investment portfolio analysis tool with risk assessment, diversification recommendations, and performance tracking against market benchmarks.',
    icon: <DollarSign className="text-emerald-700 dark:text-emerald-400" size={16} />,
  },
  {
    title: 'Customer journey map',
    query: 'Map the complete customer journey from awareness to advocacy. Include touchpoints, pain points, emotions, and optimization opportunities at each stage.',
    icon: <Users className="text-cyan-700 dark:text-cyan-400" size={16} />,
  },
  {
    title: 'A/B testing framework',
    query: 'Design a comprehensive A/B testing framework including hypothesis formation, statistical significance calculations, and result interpretation guidelines.',
    icon: <TrendingUp className="text-teal-700 dark:text-teal-400" size={16} />,
  },
  {
    title: 'Code review automation',
    query: 'Create an automated code review system that checks for security vulnerabilities, performance issues, and coding standards. Include integration with CI/CD pipelines.',
    icon: <Code className="text-violet-700 dark:text-violet-400" size={16} />,
  },
  {
    title: 'Risk assessment matrix',
    query: 'Develop a comprehensive risk assessment framework for business operations including risk identification, probability analysis, impact evaluation, and mitigation strategies.',
    icon: <Shield className="text-red-700 dark:text-red-400" size={16} />,
  },
  {
    title: 'Learning path generator',
    query: 'Create a personalized learning path generator that adapts to individual goals, current skill level, and preferred learning style. Include progress tracking and resource recommendations.',
    icon: <Brain className="text-pink-700 dark:text-pink-400" size={16} />,
  },
  {
    title: 'Social media automation',
    query: 'Design a social media automation system including content scheduling, engagement tracking, hashtag optimization, and performance analytics across multiple platforms.',
    icon: <Globe className="text-blue-600 dark:text-blue-300" size={16} />,
  },
  {
    title: 'Health tracking dashboard',
    query: 'Build a comprehensive health tracking dashboard integrating fitness data, nutrition logging, sleep patterns, and medical records with actionable insights and goal setting.',
    icon: <Heart className="text-red-600 dark:text-red-300" size={16} />,
  },
  {
    title: 'Project automation',
    query: 'Create an intelligent project management system with automatic task assignment, deadline tracking, resource allocation, and team communication integration.',
    icon: <Calendar className="text-amber-700 dark:text-amber-400" size={16} />,
  },
  {
    title: 'Sales funnel optimizer',
    query: 'Analyze and optimize the entire sales funnel from lead generation to conversion. Include lead scoring, nurture sequences, and conversion rate optimization strategies.',
    icon: <Zap className="text-yellow-600 dark:text-yellow-300" size={16} />,
  },
  {
    title: 'Startup pitch deck',
    query: 'Generate a compelling startup pitch deck including problem statement, solution overview, market analysis, business model, financial projections, and funding requirements.',
    icon: <Rocket className="text-orange-600 dark:text-orange-300" size={16} />,
  },
  {
    title: 'Photography workflow',
    query: 'Design an end-to-end photography workflow including shoot planning, file organization, editing presets, client delivery, and portfolio management systems.',
    icon: <Camera className="text-slate-700 dark:text-slate-400" size={16} />,
  },
  {
    title: 'Supply chain analysis',
    query: 'Create a supply chain optimization analysis including vendor evaluation, cost reduction opportunities, risk mitigation, and inventory management strategies.',
    icon: <Briefcase className="text-stone-700 dark:text-stone-400" size={16} />,
  },
  {
    title: 'UX research framework',
    query: 'Develop a comprehensive UX research framework including user interviews, usability testing, persona development, and data-driven design recommendations.',
    icon: <Sparkles className="text-fuchsia-700 dark:text-fuchsia-400" size={16} />,
  },
];

// Function to get random prompts
const getRandomPrompts = (count: number = 3): PromptExample[] => {
  const shuffled = [...allPrompts].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const Examples = ({
  onSelectPrompt,
}: {
  onSelectPrompt?: (query: string) => void;
}) => {
  const [displayedPrompts, setDisplayedPrompts] = useState<PromptExample[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize with random prompts on mount
  useEffect(() => {
    setDisplayedPrompts(getRandomPrompts(3));
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setDisplayedPrompts(getRandomPrompts(3));
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs text-muted-foreground font-medium">Quick starts</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <motion.div
            animate={{ rotate: isRefreshing ? 360 : 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <RefreshCw size={10} />
          </motion.div>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {displayedPrompts.map((prompt, index) => (
          <motion.div
            key={`${prompt.title}-${index}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.3,
              delay: index * 0.05,
              ease: "easeOut"
            }}
          >
            <Card
              className="group cursor-pointer h-full shadow-none transition-all bg-sidebar hover:bg-neutral-100 dark:hover:bg-neutral-800/60 p-0 justify-center"
              onClick={() => onSelectPrompt && onSelectPrompt(prompt.query)}
            >
              <CardHeader className="p-2 grid-rows-1">
                <div className="flex items-center justify-center gap-1.5">
                  <div className="flex-shrink-0">
                    {React.cloneElement(prompt.icon as React.ReactElement, { size: 14, })}
                  </div>
                  <CardTitle className="font-normal group-hover:text-foreground transition-all text-muted-foreground text-xs leading-relaxed line-clamp-3">
                    {prompt.title}
                  </CardTitle>
                </div>
              </CardHeader>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};