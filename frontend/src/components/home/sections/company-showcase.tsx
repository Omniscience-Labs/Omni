import { siteConfig } from '@/lib/home';

export function CompanyShowcase() {
  const { companyShowcase } = siteConfig;
  
  // Duplicate the logos array to create seamless infinite scroll
  const duplicatedLogos = [...companyShowcase.companyLogos, ...companyShowcase.companyLogos];
  
  return (
    <section
      id="company"
      className="flex flex-col items-center justify-center gap-10 py-10 pt-20 w-full relative px-6"
    >
      <p className="text-muted-foreground font-medium">
        Trusted by Enterprise
      </p>
      
      <div className="w-full max-w-7xl overflow-hidden relative">
        <div 
          className="flex"
          style={{
            animation: 'scroll 30s linear infinite',
          }}
        >
          {duplicatedLogos.map((logo, index) => (
            <div
              key={`${logo.id}-${index}`}
              className="flex-shrink-0 w-48 h-28 flex items-center justify-center p-4 mx-4"
            >
              <div className="flex items-center justify-center w-full h-full opacity-70 hover:opacity-100 transition-opacity duration-300">
                {logo.logo}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <style jsx global>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  );
}
