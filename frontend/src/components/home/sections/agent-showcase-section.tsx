'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

// Agent Carousel Component
const AgentCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const agents = [
    { name: 'Penn', role: 'Copywriter', icon: '✍️', desc: 'Create compelling copy for ads, blogs, and marketing campaigns that convert readers into customers.' },
    { name: 'Scouty', role: 'Recruiter', icon: '🎯', desc: 'Turn hiring challenges into opportunities with magnetic job posts and smooth onboarding.' },
    { name: 'Seomi', role: 'SEO Specialist', icon: '📈', desc: 'Boost website rankings with proven SEO strategies and optimized content.' },
    { name: 'Soshie', role: 'Social Media Manager', icon: '📱', desc: 'Generate content, plan strategies, and manage social media presence effectively.' },
    { name: 'Alex', role: 'Data Analyst', icon: '📊', desc: 'Transform raw data into actionable insights with comprehensive analysis and reporting.' },
    { name: 'Riley', role: 'Project Manager', icon: '📋', desc: 'Streamline workflows, coordinate tasks, and ensure timely project delivery.' },
    { name: 'Jordan', role: 'Code Assistant', icon: '💻', desc: 'Expert programming support with code review, debugging, and architecture design.' },
    { name: 'Quinn', role: 'Customer Support', icon: '💬', desc: 'Provide exceptional customer service with AI-powered responses and engagement.' },
    { name: 'Taylor', role: 'Content Creator', icon: '🎨', desc: 'Create engaging content across all platforms from blog articles to video scripts.' },
    { name: 'Morgan', role: 'Financial Analyst', icon: '💰', desc: 'Analyze financial data, create reports, and provide strategic business insights.' },
    { name: 'Casey', role: 'Marketing Specialist', icon: '📢', desc: 'Develop comprehensive marketing strategies and brand positioning campaigns.' },
    { name: 'River', role: 'Email Specialist', icon: '📧', desc: 'Craft effective email campaigns, newsletters, and automated sequences.' }
  ];

  const itemsPerPage = 4;
  const maxIndex = Math.max(0, agents.length - itemsPerPage);

  const nextSlide = () => {
    setCurrentIndex(prev => Math.min(prev + 1, maxIndex));
  };

  const prevSlide = () => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  };

  return (
    <div className="relative w-full">
      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        disabled={currentIndex === 0}
        className="absolute left-2 md:left-4 lg:left-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-background/80 backdrop-blur-sm border border-border/60 rounded-full flex items-center justify-center hover:bg-background hover:border-primary/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        <ArrowRight className="w-5 h-5 rotate-180" />
      </button>
      
      <button
        onClick={nextSlide}
        disabled={currentIndex >= maxIndex}
        className="absolute right-2 md:right-4 lg:right-8 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-background/80 backdrop-blur-sm border border-border/60 rounded-full flex items-center justify-center hover:bg-background hover:border-primary/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
      >
        <ArrowRight className="w-5 h-5" />
      </button>

      {/* Agent Cards Container - Full width */}
      <div className="overflow-hidden">
        <div 
          className="flex transition-transform duration-500 ease-in-out gap-8 px-8 md:px-12 lg:px-16"
          style={{ transform: `translateX(-${currentIndex * 25}%)` }}
        >
          {agents.map((agent, index) => (
            <div
              key={agent.name}
              className="flex-shrink-0 w-1/4 min-w-0"
            >
              <div className="group relative bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl p-8 h-80 hover:bg-card/80 hover:border-primary/30 hover:shadow-xl transition-all duration-300 cursor-pointer">
                <div className="flex flex-col items-center text-center space-y-4 h-full">
                  <div className="text-6xl mb-3 group-hover:scale-110 transition-transform duration-300">
                    {agent.icon}
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h3 className="text-xl font-semibold tracking-tighter mb-2 group-hover:text-primary transition-colors">
                      {agent.name}
                    </h3>
                    <p className="text-sm text-primary/70 font-medium mb-4">
                      {agent.role}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {agent.desc}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      Start chatting <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Dots */}
      <div className="flex justify-center mt-8 gap-2">
        {Array.from({ length: maxIndex + 1 }).map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              currentIndex === index
                ? 'bg-primary w-8'
                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
          />
        ))}
      </div>

      {/* Agent Counter */}
      <div className="text-center mt-4">
        <p className="text-sm text-muted-foreground">
          Showing {currentIndex + 1}-{Math.min(currentIndex + itemsPerPage, agents.length)} of {agents.length} agents
        </p>
      </div>
    </div>
  );
};

export function AgentShowcaseSection() {
  return (
    <section id="agent-showcase" className="w-full relative overflow-hidden py-16">
      <div className="relative flex flex-col items-center w-full px-6">
        {/* Agent Carousel - Full viewport width */}
        <div className="w-full">
          <div className="text-center mb-12 max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-medium tracking-tighter mb-4">
              Meet Your AI Team
            </h2>
            <p className="text-muted-foreground text-lg">
              Specialized AI agents ready to transform your workflow
            </p>
          </div>

          {/* Agent Carousel - Full width with navigation */}
          <div className="max-w-6xl mx-auto">
            <AgentCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}