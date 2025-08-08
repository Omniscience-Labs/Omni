'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    title: 'Company data enrichment',
    query: '1. Fetch the webpage content from {{source_url}}\n2. Extract list of companies and their URLs from the webpage\n3. Create a new Google Sheet named "{{sheet_name}}"\n4. Add columns for company name, URL, website, funding, and leadership\n5. Add initial company data rows with basic information (name and URL)\n6. For each company, research and gather detailed information:\n   - Search web for company information\n   - Extract company website, funding, and leadership details\n7. Update the Google Sheet with detailed company information using parallel processing',
    icon: <Briefcase className="text-blue-700 dark:text-blue-400" size={16} />,
  },
  {
    title: 'Account signal research',
    query: '1. Retrieve companies from the specified HubSpot list "{{list_name}}". Get all company IDs that are members of the list\n2. Fetch detailed information for the companies. Create a search query using the company IDs and retrieve full company records\n3. For each company in the retrieved list:\n   - Calculate the start date for news search based on {{days_lookback}}\n   - Search for recent news about the company with date filter\n   - Generate a concise summary of the news into a single paragraph\n   - Create a HubSpot note object with the news summary\n   - Add the news summary note to the company\'s HubSpot record\n   - Increment the counter of successfully updated companies\n4. Return the total count of companies that were successfully updated with news notes',
    icon: <TrendingUp className="text-green-700 dark:text-green-400" size={16} />,
  },
  {
    title: 'Lead intelligence gathering',
    query: '1. Research {{first_name}} {{last_name}} from {{company_name}} online across multiple sources\n2. Gather professional background information:\n   - Current role and responsibilities\n   - Career history and previous positions\n   - Educational background\n3. Extract recent activities and achievements:\n   - Recent posts on LinkedIn and social media\n   - Speaking engagements or conferences\n   - Published articles or thought leadership\n4. Research company details:\n   - Company size, industry, and recent news\n   - Funding rounds and growth metrics\n   - Key initiatives and challenges\n5. Compile findings into a detailed profile with actionable insights for outreach',
    icon: <Users className="text-purple-700 dark:text-purple-400" size={16} />,
  },
  {
    title: 'Personal website builder',
    query: '1. Research {{person_name}} online across various platforms:\n   - LinkedIn profile and professional history\n   - GitHub repositories and coding projects\n   - Social media presence and personal brand\n   - Published articles, blogs, or portfolio pieces\n2. Analyze the gathered information to identify:\n   - Key skills and expertise areas\n   - Professional achievements and projects\n   - Personal interests and values\n   - Target audience and career goals\n3. Create a professional personal website with:\n   - Modern, responsive design\n   - Compelling hero section with value proposition\n   - Skills and experience showcase\n   - Portfolio/projects section\n   - Contact and social links\n4. Optimize the website for SEO and professional branding',
    icon: <Globe className="text-rose-700 dark:text-rose-400" size={16} />,
  },
  {
    title: 'Executive presentation creator',
    query: '1. Research {{first_name}} {{last_name}} from {{company_name}} online to gather comprehensive information\n2. Extract key background details:\n   - Professional achievements and career milestones\n   - Leadership roles and company impact\n   - Industry recognition and awards\n   - Educational background and credentials\n3. Research company information:\n   - Company mission, values, and recent developments\n   - Market position and competitive advantages\n   - Recent news, funding, or strategic initiatives\n4. Create a sleek, Apple-inspired presentation with:\n   - Clean, minimalist design with high-quality visuals\n   - Compelling narrative structure\n   - Professional headshots and company branding\n   - Key achievements and impact metrics\n   - Strategic insights and recommendations',
    icon: <PenTool className="text-indigo-700 dark:text-indigo-400" size={16} />,
  },
  {
    title: 'Engineer talent sourcing',
    query: '1. Search for {{number_of_engineers}} software engineers in {{location}}\n2. Use multiple platforms for comprehensive search:\n   - LinkedIn advanced search with relevant filters\n   - GitHub user search by location and activity\n   - AngelList and tech job boards\n   - Stack Overflow developer profiles\n3. For each candidate, gather:\n   - Technical skills and programming languages\n   - Years of experience and seniority level\n   - Current employment status and availability\n   - Notable projects and contributions\n   - Contact information (email, LinkedIn)\n4. Filter candidates based on {{required_skills}} and {{experience_level}}\n5. Compile results into a structured report with candidate profiles',
    icon: <Code className="text-emerald-700 dark:text-emerald-400" size={16} />,
  },
  {
    title: 'Support inbox assistant',
    query: '1. Monitor the {{support_inbox}} continuously for new customer inquiries\n2. For each new support ticket:\n   - Extract the customer question and context\n   - Search the {{knowledge_base}} for relevant answers\n   - Analyze confidence level of potential responses\n3. If confidence level is above {{confidence_threshold}}:\n   - Draft a helpful response using knowledge base information\n   - Send automated reply to customer\n   - Tag ticket as "auto-resolved"\n4. If confidence level is below threshold:\n   - Escalate to {{team_slack_channel}} via DM\n   - Include ticket details, customer context, and suggested priority\n   - Tag ticket as "escalated" with timestamp\n5. Track metrics: response time, resolution rate, escalation rate',
    icon: <Shield className="text-orange-700 dark:text-orange-400" size={16} />,
  },
  {
    title: 'Invoice data extraction',
    query: '1. Search for all files in the {{invoice_folder}} directory\n2. For each PDF invoice file:\n   - Read the PDF file content using OCR if necessary\n   - Extract invoice header information: invoice number, date, due date\n   - Extract billing address and shipping address\n   - Extract all line items with descriptions, quantities, and prices\n   - Extract subtotal, tax amount, and total amount\n3. Create a new Excel worksheet for each invoice named "{{invoice_number}}"\n4. Set up structured columns:\n   - Invoice details (number, date, due date, addresses)\n   - Line items (description, quantity, unit price, total)\n   - Summary totals (subtotal, tax, grand total)\n5. Export all worksheets into a master Excel file named "{{output_filename}}"',
    icon: <BarChart3 className="text-cyan-700 dark:text-cyan-400" size={16} />,
  },
  {
    title: 'Job board aggregator',
    query: '1. Retrieve the job board webpage content from {{job_board_url}}\n2. Extract job listings from the page including:\n   - Job title and company name\n   - Experience requirements (entry, mid, senior)\n   - Work hours (full-time, part-time, contract)\n   - Job posting links and application URLs\n3. Create a new Google Sheet with name "{{sheet_name}}"\n4. Format the extracted data by:\n   - Creating headers: Title, Company, Experience, Hours, Job Link\n   - Converting job details to structured rows\n   - Marking empty fields as "Not specified"\n   - Adding posting date and location if available\n5. Insert all formatted job data into the Google Sheet\n6. Apply filters and formatting for easy sorting and analysis',
    icon: <Briefcase className="text-teal-700 dark:text-teal-400" size={16} />,
  },
  {
    title: 'Market research automation',
    query: '1. Define research scope for {{industry}} and {{target_market}}\n2. Gather industry trend data from multiple sources:\n   - Industry reports and market research publications\n   - Government databases and statistical sources\n   - News articles and press releases from past {{time_period}}\n3. Analyze competitor landscape:\n   - Identify top {{number_of_competitors}} competitors\n   - Extract pricing, features, and market positioning\n   - Analyze their marketing strategies and customer reviews\n4. Research customer segments:\n   - Demographics and psychographics data\n   - Pain points and unmet needs\n   - Buying behavior and decision factors\n5. Create visualizations and charts from collected data\n6. Compile findings into a professional report with actionable recommendations',
    icon: <Target className="text-violet-700 dark:text-violet-400" size={16} />,
  },
  {
    title: 'Social media scheduler',
    query: '1. Create content calendar for {{social_platforms}} for the next {{time_period}}\n2. For each platform, generate {{posts_per_week}} posts:\n   - Research trending topics and hashtags in {{industry}}\n   - Create engaging captions with platform-specific formatting\n   - Source or create relevant images/videos\n   - Schedule optimal posting times based on audience analytics\n3. Set up automated posting using platform APIs:\n   - Instagram: photos, stories, reels\n   - LinkedIn: professional updates and articles\n   - Twitter: tweets and threads\n4. Track engagement metrics:\n   - Likes, comments, shares, and reach\n   - Click-through rates and website traffic\n   - Follower growth and audience insights\n5. Generate weekly performance reports with recommendations',
    icon: <Calendar className="text-pink-700 dark:text-pink-400" size={16} />,
  },
  {
    title: 'Email campaign builder',
    query: '1. Segment email list based on {{segmentation_criteria}}:\n   - Demographics, purchase history, engagement level\n   - Create targeted groups for personalized messaging\n2. Design email templates for {{campaign_type}}:\n   - Create responsive HTML templates\n   - Write compelling subject lines (A/B test {{number_of_variants}} versions)\n   - Personalize content with {{customer_name}} and relevant data\n3. Set up automated email sequence:\n   - Welcome series for new subscribers\n   - Nurture campaigns based on user behavior\n   - Re-engagement campaigns for inactive users\n4. Configure tracking and analytics:\n   - Open rates, click-through rates, conversion tracking\n   - Unsubscribe rates and spam complaints\n5. Launch campaign and monitor performance in real-time\n6. Generate detailed reports with ROI analysis and optimization recommendations',
    icon: <Zap className="text-yellow-600 dark:text-yellow-300" size={16} />,
  },
  {
    title: 'Data pipeline creator',
    query: '1. Connect to data sources: {{source_databases}}, {{api_endpoints}}, and {{file_locations}}\n2. Extract data with validation rules:\n   - Check data quality and completeness\n   - Handle missing values and data type conversions\n   - Log any extraction errors or anomalies\n3. Transform data according to {{business_rules}}:\n   - Clean and standardize formats\n   - Apply calculated fields and aggregations\n   - Merge data from multiple sources\n4. Load transformed data into {{target_database}}:\n   - Create or update tables as needed\n   - Implement incremental loading strategies\n   - Maintain data lineage and audit trails\n5. Set up monitoring and alerting:\n   - Pipeline health checks and performance metrics\n   - Error notifications via {{notification_channel}}\n   - Automated retry mechanisms for failed jobs\n6. Schedule pipeline to run {{frequency}} with dependency management',
    icon: <Settings className="text-red-700 dark:text-red-400" size={16} />,
  },
  {
    title: 'Content strategy planner',
    query: '1. Analyze target audience for {{brand_name}} in {{industry}}:\n   - Demographics, interests, and pain points\n   - Content consumption preferences and platforms\n   - Competitor content analysis and gaps\n2. Develop content pillars and themes:\n   - {{pillar_1}}: Educational and how-to content\n   - {{pillar_2}}: Industry insights and trends\n   - {{pillar_3}}: Behind-the-scenes and company culture\n3. Create {{time_period}} content calendar:\n   - Blog posts: {{posts_per_month}} with SEO optimization\n   - Social media: {{social_posts_per_week}} across platforms\n   - Email newsletters: {{newsletter_frequency}}\n4. Establish content creation workflow:\n   - Research and ideation process\n   - Writing, editing, and approval stages\n   - Publishing and distribution schedule\n5. Set up performance tracking:\n   - Traffic, engagement, and conversion metrics\n   - Lead generation and customer acquisition\n6. Create monthly reports with ROI analysis and strategy adjustments',
    icon: <PenTool className="text-amber-700 dark:text-amber-400" size={16} />,
  },
  {
    title: 'Investment tracker',
    query: '1. Connect to investment accounts and import portfolio data from {{brokerage_accounts}}\n2. Analyze current portfolio allocation:\n   - Asset class distribution (stocks, bonds, real estate, crypto)\n   - Sector and geographic diversification\n   - Risk assessment based on {{risk_tolerance}}\n3. Track performance metrics:\n   - Total return vs. {{benchmark_indices}}\n   - Volatility and Sharpe ratio calculations\n   - Dividend yield and income tracking\n4. Generate rebalancing recommendations:\n   - Compare current vs. target allocation {{target_allocation}}\n   - Identify overweight and underweight positions\n   - Calculate optimal trades to minimize taxes\n5. Set up automated alerts:\n   - Portfolio drift beyond {{threshold_percentage}}\n   - Significant market movements affecting holdings\n   - Dividend payments and corporate actions\n6. Create monthly investment reports with performance summary and action items',
    icon: <DollarSign className="text-slate-700 dark:text-slate-400" size={16} />,
  },
  {
    title: 'Customer journey mapper',
    query: '1. Define customer segments for {{product_service}} and identify key personas\n2. Map journey stages from awareness to advocacy:\n   - {{stage_1}}: Awareness - how customers discover the problem\n   - {{stage_2}}: Consideration - research and evaluation process\n   - {{stage_3}}: Purchase - decision-making and buying process\n   - {{stage_4}}: Onboarding - first-time user experience\n   - {{stage_5}}: Retention - ongoing usage and satisfaction\n   - {{stage_6}}: Advocacy - referrals and word-of-mouth\n3. Identify all touchpoints at each stage:\n   - Digital: website, app, email, social media\n   - Physical: stores, events, customer service\n   - Third-party: reviews, partner channels\n4. Document pain points and emotional states:\n   - Friction areas and abandonment points\n   - Customer emotions and satisfaction levels\n5. Create optimization recommendations for each stage\n6. Develop KPIs and metrics to track journey improvements',
    icon: <Heart className="text-stone-700 dark:text-stone-400" size={16} />,
  },
  {
    title: 'A/B test analyzer',
    query: '1. Set up A/B test framework for {{test_subject}} (e.g., landing page, email, feature)\n2. Define test parameters:\n   - Hypothesis: "Changing {{variable}} will {{expected_outcome}}"\n   - Success metrics: {{primary_metric}} and {{secondary_metrics}}\n   - Test duration: {{test_duration}} or until {{sample_size}} achieved\n   - Traffic split: {{percentage_split}} between variants\n3. Implement test variants:\n   - Control (A): current version\n   - Treatment (B): new version with {{specific_changes}}\n   - Ensure proper randomization and user bucketing\n4. Monitor test performance:\n   - Real-time conversion tracking\n   - Statistical significance calculations\n   - Sample ratio mismatch detection\n5. Analyze results when test completes:\n   - Calculate confidence intervals and p-values\n   - Determine winner based on {{significance_threshold}}\n   - Assess practical significance vs. statistical significance\n6. Generate test report with recommendations and next steps',
    icon: <Brain className="text-fuchsia-700 dark:text-fuchsia-400" size={16} />,
  },
  {
    title: 'Learning path optimizer',
    query: '1. Assess current skill level for {{learner_name}} in {{subject_area}}:\n   - Take initial assessment quiz or interview\n   - Identify knowledge gaps and strengths\n   - Determine {{learning_style}} preference (visual, auditory, kinesthetic)\n2. Define learning objectives:\n   - Short-term goals ({{timeframe_short}}): specific skills to master\n   - Long-term goals ({{timeframe_long}}): career or project outcomes\n   - Success criteria and milestones\n3. Create personalized learning path:\n   - Sequence topics based on dependencies and difficulty\n   - Mix learning formats: videos, articles, hands-on projects\n   - Allocate {{study_hours_per_week}} across different activities\n4. Curate resources and materials:\n   - Free and paid courses from {{preferred_platforms}}\n   - Books, documentation, and reference materials\n   - Practice exercises and real-world projects\n5. Set up progress tracking:\n   - Weekly check-ins and milestone celebrations\n   - Adaptive path adjustments based on performance\n6. Generate learning analytics and recommendations for optimization',
    icon: <Sparkles className="text-blue-600 dark:text-blue-300" size={16} />,
  },
  {
    title: 'Project workflow automation',
    query: '1. Set up project structure for {{project_name}} with {{team_size}} team members\n2. Define project phases and milestones:\n   - Planning phase: requirements gathering and scope definition\n   - Design phase: mockups, architecture, and technical specifications\n   - Development phase: implementation and testing\n   - Launch phase: deployment and go-live activities\n3. Automate task management:\n   - Create tasks from {{project_template}} or requirements\n   - Auto-assign tasks based on {{team_member_skills}} and availability\n   - Set dependencies and critical path calculations\n4. Implement progress tracking:\n   - Daily standups and status updates\n   - Burndown charts and velocity tracking\n   - Risk identification and mitigation planning\n5. Set up team communication automation:\n   - Slack notifications for task updates and deadlines\n   - Weekly progress reports to {{stakeholders}}\n   - Escalation alerts for blocked or overdue tasks\n6. Generate project analytics and bottleneck identification reports',
    icon: <Rocket className="text-green-600 dark:text-green-300" size={16} />,
  },
  {
    title: 'Competitive analysis dashboard',
    query: '1. Identify {{number_of_competitors}} key competitors in {{industry}} and {{market_segment}}\n2. Set up automated monitoring for each competitor:\n   - Website changes and new product announcements\n   - Pricing updates and promotional campaigns\n   - Social media activity and engagement metrics\n   - Job postings and hiring patterns\n3. Track competitive metrics:\n   - Market share and revenue estimates\n   - Customer reviews and satisfaction scores\n   - SEO rankings for {{target_keywords}}\n   - App store ratings and download trends\n4. Analyze competitive strategies:\n   - Product feature comparisons\n   - Marketing messaging and positioning\n   - Partnership and integration announcements\n5. Generate insights and opportunities:\n   - Market gaps and white space analysis\n   - Pricing optimization recommendations\n   - Feature development priorities\n6. Create {{report_frequency}} competitive intelligence reports with strategic recommendations',
    icon: <Camera className="text-red-600 dark:text-red-300" size={16} />,
  },
];

// Function to get random prompts
const getRandomPrompts = (count: number = 3): PromptExample[] => {
  const shuffled = [...allPrompts].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

export const Examples = ({
  onSelectPrompt,
  count = 3,
}: {
  onSelectPrompt?: (query: string) => void;
  count?: number;
}) => {
  const [displayedPrompts, setDisplayedPrompts] = useState<PromptExample[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize with random prompts on mount
  useEffect(() => {
    setDisplayedPrompts(getRandomPrompts(count));
  }, [count]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setDisplayedPrompts(getRandomPrompts(count));
    setTimeout(() => setIsRefreshing(false), 300);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="group relative">
        <div className="flex gap-2 justify-center py-2 flex-wrap">
          {displayedPrompts.map((prompt, index) => (
            <motion.div
              key={`${prompt.title}-${index}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.3,
                delay: index * 0.03,
                ease: "easeOut"
              }}
            >
              <Button
                variant="outline"
                className="w-fit h-fit px-3 py-2 rounded-full border-neutral-200 dark:border-neutral-800 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onSelectPrompt && onSelectPrompt(prompt.query)}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-shrink-0">
                    {React.cloneElement(prompt.icon as React.ReactElement, { size: 14 })}
                  </div>
                  <span className="whitespace-nowrap">{prompt.title}</span>
                </div>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Refresh button that appears on hover */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          className="absolute -top-4 right-1 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <motion.div
            animate={{ rotate: isRefreshing ? 360 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <RefreshCw size={10} className="text-muted-foreground" />
          </motion.div>
        </Button>
      </div>
    </div>
  );
};