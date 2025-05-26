'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart3,
  Bot,
  Briefcase,
  Settings,
  Sparkles,
} from 'lucide-react';

type PromptExample = {
  title: string;
  query: string;
  icon: React.ReactNode;
};

const prompts: PromptExample[] = [
  {
    title: 'Market research dashboard',
    query: 'Create a comprehensive market research dashboard analyzing industry trends, customer segments, and competitive landscape. Include data visualization and actionable recommendations.',
    icon: <BarChart3 className="text-green-700 dark:text-green-400" size={16} />,
  },
  {
    title: 'Recommendation engine development',
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
];

export const Examples = ({
  onSelectPrompt,
}: {
  onSelectPrompt?: (query: string) => void;
}) => {
  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {prompts.map((prompt, index) => (
          <Card
            key={index}
            className="group cursor-pointer h-full shadow-none transition-all bg-sidebar hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
            onClick={() => onSelectPrompt && onSelectPrompt(prompt.query)}
          >
            <CardHeader className="px-4">
                <div className="flex items-center gap-2">
                    {prompt.icon}
                </div>
                <CardTitle className="font-normal group-hover:text-foreground transition-all text-muted-foreground text-sm line-clamp-3">
                    {prompt.title}
                </CardTitle>
            </CardHeader>

          </Card>
        ))}
      </div>
    </div>
  );
};