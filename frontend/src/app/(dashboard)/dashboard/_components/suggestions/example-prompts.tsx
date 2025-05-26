'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Bot,
  Briefcase,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

type PromptExample = {
  title: string;
  description: string;
  query: string;
};

type CategoryData = {
  [key: string]: {
    title: string;
    icon: React.ReactNode;
    color: string;
    examples: PromptExample[];
  };
};

const categoryData: CategoryData = {
  data: {
    title: 'Data Analysis & Research',
    icon: <BarChart3 size={14} />,
    color: 'bg-blue-500 dark:bg-blue-600',
    examples: [
      {
        title: 'Market research dashboard',
        description: 'Comprehensive market analysis and insights',
        query: 'Create a comprehensive market research dashboard analyzing industry trends, customer segments, and competitive landscape. Include data visualization and actionable recommendations.',
      },
      {
        title: 'Survey data analysis',
        description: 'Statistical analysis of survey responses',
        query: 'Analyze survey responses to identify key patterns, statistical significance, and customer insights. Create visual reports with recommendations for business decisions.',
      },
      {
        title: 'Business intelligence reporting',
        description: 'KPI tracking and performance analysis',
        query: 'Build a business intelligence report tracking key performance indicators. Include trend analysis, forecasting, and automated alerts for significant changes.',
      },
      {
        title: 'Competitor pricing analysis',
        description: 'Competitive pricing strategy research',
        query: 'Conduct competitor pricing analysis across multiple products and markets. Identify pricing strategies, market positioning, and optimization opportunities.',
      },
      {
        title: 'Customer segmentation analysis',
        description: 'Data-driven customer profiling and targeting',
        query: 'Perform customer segmentation analysis using behavioral and demographic data. Create detailed personas and targeting recommendations for marketing campaigns.',
      },
      {
        title: 'Sales performance dashboard',
        description: 'Revenue tracking and sales analytics',
        query: 'Create a sales performance dashboard with real-time metrics, conversion funnel analysis, and predictive forecasting for revenue planning.',
      },
      {
        title: 'Website analytics deep dive',
        description: 'User behavior and conversion optimization',
        query: 'Analyze website analytics data to identify user behavior patterns, conversion bottlenecks, and optimization opportunities for improved performance.',
      },
      {
        title: 'Financial trend analysis',
        description: 'Financial data modeling and forecasting',
        query: 'Analyze financial trends and create forecasting models for budgeting and strategic planning. Include scenario analysis and risk assessment.',
      },
    ],
  },
  ai: {
    title: 'AI & Machine Learning',
    icon: <Bot size={14} />,
    color: 'bg-purple-500 dark:bg-purple-600',
    examples: [
      {
        title: 'Recommendation engine development',
        description: 'Personalized content and product recommendations',
        query: 'Develop a recommendation engine for personalized product suggestions. Include collaborative filtering, content-based filtering, and hybrid approaches with evaluation metrics.',
      },
      {
        title: 'Natural language processing tool',
        description: 'Text analysis and sentiment detection',
        query: 'Create an NLP tool for analyzing customer feedback and social media sentiment. Include preprocessing, classification, and visualization of insights.',
      },
      {
        title: 'Computer vision application',
        description: 'Image recognition and processing automation',
        query: 'Build a computer vision application for automated image classification and object detection. Include model training, optimization, and deployment guidelines.',
      },
      {
        title: 'Fraud detection system',
        description: 'Anomaly detection for financial transactions',
        query: 'Develop a fraud detection system using machine learning algorithms. Include feature engineering, model selection, real-time scoring, and alert mechanisms.',
      },
      {
        title: 'Demand forecasting model',
        description: 'Predictive analytics for inventory management',
        query: 'Create a demand forecasting model for inventory optimization. Include time series analysis, seasonal adjustments, and business impact assessment.',
      },
      {
        title: 'AI-powered content generation',
        description: 'Automated content creation and optimization',
        query: 'Build an AI system for automated content generation and optimization. Include quality control, brand consistency, and performance tracking.',
      },
      {
        title: 'Voice assistant integration',
        description: 'Speech recognition and natural language understanding',
        query: 'Develop a voice assistant integration for customer service. Include speech-to-text, intent recognition, and response generation capabilities.',
      },
      {
        title: 'Predictive maintenance system',
        description: 'IoT data analysis for equipment monitoring',
        query: 'Create a predictive maintenance system using IoT sensor data. Include anomaly detection, failure prediction, and maintenance scheduling optimization.',
      },
    ],
  },
  business: {
    title: 'Business & Strategy',
    icon: <Briefcase size={14} />,
    color: 'bg-emerald-500 dark:bg-emerald-600',
    examples: [
      {
        title: 'Go-to-market strategy',
        description: 'Product launch and market entry planning',
        query: 'Develop a comprehensive go-to-market strategy for a new product. Include market sizing, customer acquisition channels, pricing strategy, and launch timeline.',
      },
      {
        title: 'Brand positioning framework',
        description: 'Brand identity and competitive differentiation',
        query: 'Create a brand positioning framework that differentiates from competitors. Include brand architecture, messaging hierarchy, and implementation guidelines.',
      },
      {
        title: 'Growth hacking playbook',
        description: 'Scalable user acquisition and retention strategies',
        query: 'Design a growth hacking playbook with experimental frameworks, user acquisition funnels, retention strategies, and measurable growth metrics.',
      },
      {
        title: 'Strategic partnership analysis',
        description: 'Partnership evaluation and negotiation strategy',
        query: 'Analyze potential strategic partnerships and create evaluation criteria. Include partnership models, negotiation strategies, and success metrics.',
      },
      {
        title: 'Digital transformation roadmap',
        description: 'Technology adoption and organizational change',
        query: 'Create a digital transformation roadmap for organizational modernization. Include technology assessment, change management, and implementation phases.',
      },
      {
        title: 'Pricing optimization strategy',
        description: 'Revenue maximization through pricing models',
        query: 'Develop a pricing optimization strategy using market research and competitor analysis. Include dynamic pricing models and revenue impact projections.',
      },
      {
        title: 'Customer retention program',
        description: 'Loyalty and engagement strategy development',
        query: 'Design a comprehensive customer retention program with loyalty incentives, engagement strategies, and churn reduction tactics.',
      },
      {
        title: 'Market expansion analysis',
        description: 'New market opportunity assessment',
        query: 'Conduct market expansion analysis for entering new geographic or demographic markets. Include risk assessment, resource requirements, and entry strategies.',
      },
    ],
  },
  automation: {
    title: 'Automation & Scripts',
    icon: <Settings size={14} />,
    color: 'bg-orange-500 dark:bg-orange-600',
    examples: [
      {
        title: 'Data pipeline automation',
        description: 'ETL processes and data workflow management',
        query: 'Create an automated data pipeline for ETL processes. Include data validation, error handling, monitoring, and scalable architecture design.',
      },
      {
        title: 'Email marketing automation',
        description: 'Automated email campaigns and nurture sequences',
        query: 'Build an email marketing automation system with segmentation, personalization, A/B testing, and performance tracking capabilities.',
      },
      {
        title: 'Social media scheduling bot',
        description: 'Automated content publishing and engagement',
        query: 'Develop a social media scheduling bot for automated content publishing. Include multi-platform support, optimal timing, and engagement tracking.',
      },
      {
        title: 'Invoice processing automation',
        description: 'Automated invoice generation and management',
        query: 'Create an automated invoice processing system with OCR, data extraction, approval workflows, and integration with accounting systems.',
      },
      {
        title: 'Lead qualification automation',
        description: 'Automated lead scoring and routing system',
        query: 'Build a lead qualification automation system with scoring algorithms, routing rules, and CRM integration for sales team efficiency.',
      },
      {
        title: 'Inventory management automation',
        description: 'Stock monitoring and reorder automation',
        query: 'Develop an inventory management automation system with real-time tracking, automatic reordering, and supplier integration.',
      },
      {
        title: 'Report generation automation',
        description: 'Automated business reporting and distribution',
        query: 'Create an automated report generation system with scheduled delivery, customizable templates, and stakeholder-specific formatting.',
      },
      {
        title: 'Quality assurance automation',
        description: 'Automated testing and quality control processes',
        query: 'Build a quality assurance automation framework with test case generation, execution scheduling, and results reporting.',
      },
    ],
  },
  emerging: {
    title: 'Emerging Use Cases',
    icon: <TrendingUp size={14} />,
    color: 'bg-indigo-500 dark:bg-indigo-600',
    examples: [
      {
        title: 'Real estate investment analysis',
        description: 'Property valuation and market opportunity assessment',
        query: 'Analyze real estate listings to identify high-value investment opportunities. Include market trends, ROI calculations, risk assessment, and portfolio recommendations.',
      },
      {
        title: 'Trading algorithm development',
        description: 'Automated trading strategies and backtesting',
        query: 'Develop a trading algorithm with backtesting capabilities. Include technical indicators, risk management, portfolio optimization, and performance analysis.',
      },
      {
        title: 'Content creation suite',
        description: 'Multi-format content generation and optimization',
        query: 'Create a comprehensive content creation suite for blogs, social media, and presentations. Include SEO optimization, brand consistency, and performance tracking.',
      },
      {
        title: 'Property management automation',
        description: 'Tenant communication and maintenance scheduling',
        query: 'Build a property management automation system with tenant portals, maintenance scheduling, rent collection, and financial reporting.',
      },
      {
        title: 'Portfolio management dashboard',
        description: 'Investment tracking and risk analysis',
        query: 'Create a portfolio management dashboard with real-time tracking, risk analysis, performance attribution, and rebalancing recommendations.',
      },
      {
        title: 'Presentation automation tool',
        description: 'Dynamic slide generation and design optimization',
        query: 'Develop a presentation automation tool that generates slides from data inputs. Include template management, design optimization, and collaboration features.',
      },
      {
        title: 'Market sentiment analyzer',
        description: 'News and social media sentiment tracking',
        query: 'Build a market sentiment analyzer using news and social media data. Include sentiment scoring, trend identification, and investment signal generation.',
      },
      {
        title: 'Documentation generator',
        description: 'Automated technical and business documentation',
        query: 'Create an automated documentation generator for technical and business processes. Include template management, version control, and collaboration workflows.',
      },
    ],
  },
};

export const ExamplePrompts = ({
  onSelectPrompt,
}: {
  onSelectPrompt?: (query: string) => void;
}) => {
  const [activeCategory, setActiveCategory] = useState('data');
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 300);
    return () => clearTimeout(timer);
  }, [activeCategory]);

  return (
    <div className="w-full max-w-6xl mx-auto px-2">
      <motion.div
        initial={{ y: 0, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap gap-2 mb-6 justify-center"
      >
        {Object.keys(categoryData).map((category) => (
          <motion.div key={category}>
            <Button
              variant={activeCategory === category ? 'default' : 'outline'}
              className={cn(
                'text-sm rounded-full transition-all duration-300 relative overflow-hidden',
                activeCategory === category ? 'px-5' : 'px-4',
                'flex items-center gap-1.5',
              )}
              size="sm"
              onClick={() => {
                if (activeCategory !== category) {
                  setActiveCategory(category);
                }
              }}
            >
              {activeCategory === category && (
                <motion.div
                  layoutId="activeCategoryBackground"
                  className={cn(
                    'absolute inset-0 opacity-90 dark:opacity-80 rounded-full bg-primary',
                  )}
                  initial={{ scale: 1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                />
              )}
              <span className="relative z-10">
                {categoryData[category].icon}
              </span>
              <span className="relative z-10">
                {categoryData[category].title}
              </span>
            </Button>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        className="mt-4 mb-12"
        initial={false}
        animate={{ opacity: isTransitioning ? 0.5 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {categoryData[activeCategory].examples.map((example, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: index * 0.05,
                duration: 0.3,
                type: 'spring',
                stiffness: 100,
              }}
            >
              <Card
                className={cn(
                  'cursor-pointer h-full shadow-none transition-all duration-300 bg-muted/50 dark:bg-card/50 relative overflow-hidden group',
                  hoveredCard === index
                    ? 'border-primary/70 dark:border-primary/70'
                    : 'hover:border-primary/40',
                )}
                onClick={() => onSelectPrompt && onSelectPrompt(example.query)}
                onMouseEnter={() => setHoveredCard(index)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {hoveredCard === index && (
                  <motion.div
                    className="absolute inset-0 bg-primary/5 dark:bg-primary/10 pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
                <CardHeader className="px-4 relative">
                  <motion.div
                    className={cn(
                      'w-8 h-8 p-2 rounded-full flex items-center justify-center bg-primary',
                    )}
                    whileHover={{ rotate: 10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 10 }}
                  >
                    <div className="text-background">
                      {categoryData[activeCategory].icon}
                    </div>
                  </motion.div>
                  <div className="flex items-start justify-between mb-1">
                    <CardTitle
                      className={cn(
                        'text-md font-semibold text-foreground',
                      )}
                    >
                      {example.title}
                    </CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {example.description}
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <p className="text-xs text-muted-foreground/80 line-clamp-2 group-hover:text-muted-foreground transition-colors duration-200">
                    {example.query}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};