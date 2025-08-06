from typing import Dict, List, Any
from dataclasses import dataclass

@dataclass
class ColorScheme:
    name: str
    primary: str
    secondary: str
    accent: str
    background: str
    text: str
    text_secondary: str

@dataclass
class PresentationTemplate:
    name: str
    description: str
    color_schemes: List[ColorScheme]
    layouts: List[str]
    css_template: str

MINIMAL_SCHEMES = [
    ColorScheme("Dark", "#000000", "#1D1D1F", "#007AFF", "#000000", "#FFFFFF", "#A1A1A6"),
    ColorScheme("Light", "#FFFFFF", "#F2F2F7", "#007AFF", "#FFFFFF", "#000000", "#6D6D70"),
    ColorScheme("Blue", "#001F3F", "#003366", "#00A8FF", "#001F3F", "#FFFFFF", "#B3D9FF"),
]

CORPORATE_SCHEMES = [
    ColorScheme("Professional", "#1C1C1E", "#2C2C2E", "#00C896", "#1C1C1E", "#FFFFFF", "#98989D"),
    ColorScheme("Navy", "#0A1628", "#1A2332", "#4A90E2", "#0A1628", "#FFFFFF", "#7FB3D3"),
    ColorScheme("Charcoal", "#2D2D30", "#3E3E42", "#FF6B35", "#2D2D30", "#FFFFFF", "#CDCDCD"),
]

CREATIVE_SCHEMES = [
    ColorScheme("Sunset", "#1A0B3D", "#2D1B69", "#FF6B9D", "#1A0B3D", "#FFFFFF", "#C9A9DD"),
    ColorScheme("Forest", "#0F2027", "#203A43", "#2C5F41", "#0F2027", "#FFFFFF", "#A8D5BA"),
    ColorScheme("Ocean", "#0C1B3D", "#1E3A5F", "#4ECDC4", "#0C1B3D", "#FFFFFF", "#87CEEB"),
]


MINIMAL_CSS = """
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}}

body {{
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
    font-weight: 300;
    line-height: 1.4;
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: {background};
    color: {text};
}}

.slide {{
    width: 100vw;
    height: 100vh;
    max-width: 1920px;
    max-height: 1080px;
    aspect-ratio: 16/9;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: clamp(40px, 5vw, 120px);
    position: relative;
    margin: 0 auto;
    background: {background};
}}

/* Typography Hierarchy */
h1 {{
    font-size: clamp(3rem, 8vw, 8rem);
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 0.9;
    margin-bottom: clamp(20px, 3vw, 60px);
    color: {text};
}}

h2 {{
    font-size: clamp(1.5rem, 4vw, 4rem);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.1;
    margin-bottom: clamp(15px, 2vw, 40px);
    color: {text};
}}

.subtitle {{
    font-size: clamp(1.2rem, 2.5vw, 2.5rem);
    font-weight: 300;
    opacity: 0.85;
    margin-bottom: clamp(30px, 4vw, 80px);
    color: {text_secondary};
}}

/* Layout: Hero */
.slide.hero {{
    text-align: center;
    justify-content: center;
}}

.slide.hero h1 {{
    font-size: clamp(4rem, 10vw, 12rem);
    background: linear-gradient(135deg, {text}, {accent});
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}}

/* Layout: Content */
.slide.content {{
    justify-content: flex-start;
    padding-top: clamp(60px, 8vw, 160px);
}}

.content-section {{
    max-width: 75%;
}}

ul {{
    list-style: none;
    margin: clamp(20px, 3vw, 60px) 0;
}}

li {{
    margin: clamp(12px, 2vw, 32px) 0;
    font-size: clamp(1.1rem, 2vw, 2.2rem);
    display: flex;
    align-items: center;
}}

.emoji {{
    font-size: clamp(1.3rem, 2.5vw, 2.8rem);
    margin-right: clamp(12px, 2vw, 24px);
    min-width: clamp(32px, 4vw, 48px);
}}

/* Layout: Image Split */
.slide.image-split {{
    flex-direction: row;
    align-items: center;
    gap: clamp(40px, 6vw, 120px);
}}

.content-half {{
    flex: 1;
    max-width: 50%;
}}

.image-half {{
    flex: 1;
    max-width: 50%;
    height: 70vh;
    display: flex;
    align-items: center;
    justify-content: center;
}}

.image-half img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: clamp(12px, 2vw, 32px);
    box-shadow: 0 clamp(20px, 4vw, 60px) clamp(40px, 8vw, 120px) rgba(0, 0, 0, 0.3);
}}

/* Layout: Quote */
.slide.quote {{
    text-align: center;
    justify-content: center;
}}

.quote-text {{
    font-size: clamp(2rem, 5vw, 5rem);
    font-weight: 300;
    line-height: 1.2;
    font-style: italic;
    margin-bottom: clamp(30px, 4vw, 80px);
    color: {text};
    opacity: 0.95;
}}

.quote-author {{
    font-size: clamp(1rem, 2vw, 2rem);
    font-weight: 500;
    color: {accent};
    opacity: 0.8;
}}

/* Layout: Minimal Center */
.slide.minimal {{
    text-align: center;
    justify-content: center;
}}

.slide.minimal h1 {{
    font-size: clamp(5rem, 12vw, 14rem);
    font-weight: 200;
    letter-spacing: -0.04em;
}}

/* Slide Number */
.slide-number {{
    position: absolute;
    bottom: clamp(20px, 3vw, 60px);
    right: clamp(20px, 3vw, 60px);
    font-size: clamp(0.8rem, 1.5vw, 1.5rem);
    opacity: 0.4;
    font-weight: 300;
}}

.slide {{
    /* Static slide - no animations */
}}

/* Responsive */
@media (max-width: 768px) {{
    .slide {{
        padding: clamp(20px, 5vw, 40px);
    }}
    
    .slide.image-split {{
        flex-direction: column;
        gap: clamp(20px, 4vw, 40px);
    }}
    
    .content-half,
    .image-half {{
        max-width: 100%;
    }}
}}
"""

CORPORATE_CSS = """
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}}

body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-weight: 400;
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: {background};
    color: {text};
}}

.slide {{
    width: 100vw;
    height: 100vh;
    max-width: 1920px;
    max-height: 1080px;
    aspect-ratio: 16/9;
    display: flex;
    flex-direction: column;
    padding: clamp(60px, 7vw, 140px);
    position: relative;
    margin: 0 auto;
    background: linear-gradient(135deg, {background} 0%, {secondary} 100%);
}}

/* Header Section */
.slide-header {{
    border-bottom: 2px solid {accent};
    padding-bottom: clamp(20px, 3vw, 40px);
    margin-bottom: clamp(40px, 5vw, 80px);
}}

h1 {{
    font-size: clamp(2.5rem, 6vw, 6rem);
    font-weight: 700;
    line-height: 1.1;
    color: {text};
    margin-bottom: clamp(10px, 2vw, 20px);
}}

.subtitle {{
    font-size: clamp(1rem, 2vw, 2rem);
    font-weight: 300;
    color: {accent};
    text-transform: uppercase;
    letter-spacing: 0.1em;
}}

/* Layout: Title Slide */
.slide.title {{
    justify-content: center;
    text-align: center;
}}

.slide.title h1 {{
    font-size: clamp(4rem, 9vw, 9rem);
    font-weight: 800;
    margin-bottom: clamp(30px, 4vw, 60px);
}}

.company-logo {{
    width: clamp(60px, 10vw, 120px);
    height: auto;
    margin-top: clamp(40px, 6vw, 80px);
    opacity: 0.8;
}}

/* Layout: Agenda */
.slide.agenda {{
    justify-content: flex-start;
}}

.agenda-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: clamp(20px, 3vw, 40px);
    margin-top: clamp(20px, 3vw, 40px);
}}

.agenda-item {{
    background: rgba(255, 255, 255, 0.05);
    padding: clamp(20px, 3vw, 40px);
    border-radius: clamp(8px, 1.5vw, 16px);
    border-left: 4px solid {accent};
    backdrop-filter: blur(10px);
}}

.agenda-number {{
    font-size: clamp(1.5rem, 3vw, 3rem);
    font-weight: 700;
    color: {accent};
    margin-bottom: clamp(10px, 2vw, 20px);
}}

.agenda-title {{
    font-size: clamp(1.1rem, 2vw, 2rem);
    font-weight: 600;
    margin-bottom: clamp(8px, 1.5vw, 16px);
}}

.agenda-desc {{
    font-size: clamp(0.9rem, 1.5vw, 1.5rem);
    opacity: 0.8;
    line-height: 1.4;
}}

/* Layout: Content with Data */
.slide.data {{
    justify-content: flex-start;
}}

.metrics-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: clamp(20px, 3vw, 40px);
    margin-top: clamp(30px, 4vw, 60px);
}}

.metric-card {{
    text-align: center;
    background: rgba(255, 255, 255, 0.08);
    padding: clamp(30px, 4vw, 60px) clamp(20px, 3vw, 40px);
    border-radius: clamp(12px, 2vw, 24px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
}}

.metric-value {{
    font-size: clamp(2.5rem, 5vw, 5rem);
    font-weight: 800;
    color: {accent};
    line-height: 1;
    margin-bottom: clamp(10px, 2vw, 20px);
}}

.metric-label {{
    font-size: clamp(0.9rem, 1.5vw, 1.5rem);
    font-weight: 500;
    opacity: 0.9;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}}

/* Content Lists */
ul {{
    list-style: none;
    margin: clamp(20px, 3vw, 40px) 0;
}}

li {{
    margin: clamp(15px, 2.5vw, 30px) 0;
    font-size: clamp(1.1rem, 2vw, 2rem);
    padding-left: clamp(30px, 4vw, 60px);
    position: relative;
}}

li::before {{
    content: "▶";
    position: absolute;
    left: 0;
    color: {accent};
    font-size: 0.8em;
}}

/* Slide Number */
.slide-number {{
    position: absolute;
    bottom: clamp(30px, 4vw, 60px);
    right: clamp(30px, 4vw, 60px);
    font-size: clamp(1rem, 1.8vw, 1.8rem);
    opacity: 0.6;
    font-weight: 500;
}}

/* Responsive */
@media (max-width: 768px) {{
    .slide {{
        padding: clamp(30px, 6vw, 60px);
    }}
    
    .metrics-grid {{
        grid-template-columns: 1fr;
    }}
    
    .agenda-grid {{
        grid-template-columns: 1fr;
    }}
}}
"""

CREATIVE_CSS = """
* {{
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}}

body {{
    font-family: 'Playfair Display', 'Georgia', serif;
    font-weight: 300;
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: {background};
    color: {text};
}}

.slide {{
    width: 100vw;
    height: 100vh;
    max-width: 1920px;
    max-height: 1080px;
    aspect-ratio: 16/9;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: clamp(40px, 5vw, 100px);
    position: relative;
    margin: 0 auto;
    background: radial-gradient(ellipse at center, {secondary} 0%, {background} 100%);
}}

/* Typography with Artistic Flair */
h1 {{
    font-size: clamp(3.5rem, 8vw, 8.5rem);
    font-weight: 300;
    line-height: 0.95;
    letter-spacing: -0.02em;
    margin-bottom: clamp(20px, 3vw, 50px);
    color: {text};
    text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}}

h2 {{
    font-size: clamp(1.8rem, 4vw, 4.5rem);
    font-weight: 400;
    line-height: 1.2;
    margin-bottom: clamp(20px, 3vw, 40px);
    color: {text};
}}

.subtitle {{
    font-family: 'Inter', sans-serif;
    font-size: clamp(1.1rem, 2.2vw, 2.2rem);
    font-weight: 300;
    opacity: 0.9;
    margin-bottom: clamp(30px, 4vw, 60px);
    color: {text_secondary};
    font-style: italic;
}}

/* Layout: Image Hero */
.slide.image-hero {{
    padding: 0;
    position: relative;
    overflow: hidden;
}}

.hero-background {{
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}}

.hero-overlay {{
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
        135deg, 
        rgba(0, 0, 0, 0.6) 0%, 
        rgba(0, 0, 0, 0.3) 50%, 
        rgba(0, 0, 0, 0.7) 100%
    );
    z-index: 2;
}}

.hero-content {{
    position: relative;
    z-index: 3;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: clamp(60px, 8vw, 160px);
    text-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
}}

.hero-content h1 {{
    font-size: clamp(4rem, 10vw, 11rem);
    font-weight: 200;
    margin-bottom: clamp(30px, 4vw, 60px);
    max-width: 70%;
}}

/* Layout: Gallery */
.slide.gallery {{
    flex-direction: row;
    align-items: stretch;
    gap: clamp(30px, 4vw, 80px);
    padding: clamp(60px, 7vw, 140px);
}}

.gallery-content {{
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
}}

.gallery-images {{
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: clamp(15px, 2vw, 30px);
    height: 70vh;
}}

.gallery-image {{
    border-radius: clamp(12px, 2vw, 24px);
    overflow: hidden;
    box-shadow: 0 clamp(10px, 2vw, 30px) clamp(30px, 5vw, 80px) rgba(0, 0, 0, 0.4);
}}

.gallery-image img {{
    width: 100%;
    height: 100%;
    object-fit: cover;
}}

.gallery-image:first-child {{
    grid-row: 1 / 3;
}}

/* Layout: Story (Full Image with Text Overlay) */
.slide.story {{
    padding: 0;
    position: relative;
    color: white;
}}

.story-background {{
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}}

.story-gradient {{
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 60%;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    z-index: 2;
}}

.story-text {{
    position: absolute;
    bottom: clamp(60px, 8vw, 160px);
    left: clamp(60px, 8vw, 160px);
    right: clamp(60px, 8vw, 160px);
    z-index: 3;
}}

.story-text h1 {{
    font-size: clamp(3rem, 7vw, 7rem);
    margin-bottom: clamp(20px, 3vw, 40px);
}}

.story-text p {{
    font-size: clamp(1.2rem, 2.5vw, 2.5rem);
    line-height: 1.4;
    opacity: 0.95;
}}

/* Layout: Quote with Artistic Elements */
.slide.quote {{
    text-align: center;
    justify-content: center;
    position: relative;
}}

.quote::before {{
    content: "\\"";
    position: absolute;
    top: clamp(20px, 3vw, 60px);
    left: clamp(40px, 5vw, 100px);
    font-size: clamp(8rem, 15vw, 20rem);
    color: {accent};
    opacity: 0.2;
    font-family: serif;
    line-height: 1;
}}

.quote-text {{
    font-size: clamp(2.2rem, 5vw, 5.5rem);
    font-weight: 300;
    line-height: 1.3;
    font-style: italic;
    margin-bottom: clamp(40px, 5vw, 80px);
    max-width: 85%;
    margin-left: auto;
    margin-right: auto;
    position: relative;
    z-index: 2;
}}

.quote-author {{
    font-family: 'Inter', sans-serif;
    font-size: clamp(1.1rem, 2.2vw, 2.2rem);
    font-weight: 500;
    color: {accent};
    opacity: 0.9;
    position: relative;
    z-index: 2;
}}

.quote-author::before {{
    content: "— ";
}}

/* Artistic Elements */
.slide::after {{
    content: "";
    position: absolute;
    top: clamp(40px, 5vw, 80px);
    right: clamp(40px, 5vw, 80px);
    width: clamp(60px, 8vw, 120px);
    height: clamp(60px, 8vw, 120px);
    background: linear-gradient(45deg, {accent}, transparent);
    border-radius: 50%;
    opacity: 0.1;
    z-index: 1;
}}

/* Slide Number */
.slide-number {{
    position: absolute;
    bottom: clamp(30px, 4vw, 60px);
    right: clamp(30px, 4vw, 60px);
    font-family: 'Inter', sans-serif;
    font-size: clamp(0.9rem, 1.6vw, 1.6rem);
    opacity: 0.5;
    font-weight: 300;
    z-index: 10;
}}

/* Static slides - no animations */
.slide {{
    /* No animations for better PPTX compatibility */
}}

/* Responsive */
@media (max-width: 768px) {{
    .slide.gallery {{
        flex-direction: column;
    }}
    
    .gallery-images {{
        grid-template-columns: 1fr;
        grid-template-rows: repeat(4, 1fr);
        height: 50vh;
    }}
    
    .gallery-image:first-child {{
        grid-row: auto;
    }}
    
    .hero-content,
    .story-text {{
        padding: clamp(30px, 6vw, 60px);
    }}
}}
"""

TEMPLATES = {
    "minimal": PresentationTemplate(
        name="Minimal",
        description="Clean, Apple Keynote-inspired design with focus on typography and white space",
        color_schemes=MINIMAL_SCHEMES,
        layouts=["hero", "content", "image-split", "quote", "minimal"],
        css_template=MINIMAL_CSS
    ),
    
    "corporate": PresentationTemplate(
        name="Corporate",
        description="Professional business presentation with data visualization support",
        color_schemes=CORPORATE_SCHEMES,
        layouts=["title", "agenda", "content", "data"],
        css_template=CORPORATE_CSS
    ),
    
    "creative": PresentationTemplate(
        name="Creative",
        description="Artistic, magazine-style design for visual storytelling",
        color_schemes=CREATIVE_SCHEMES,
        layouts=["image-hero", "gallery", "story", "quote"],
        css_template=CREATIVE_CSS
    )
}

def get_template(template_name: str) -> PresentationTemplate:
    return TEMPLATES.get(template_name.lower(), TEMPLATES["minimal"])

def get_template_css(template_name: str, color_scheme_name: str = None) -> str:
    template = get_template(template_name)
    
    if not color_scheme_name:
        color_scheme = template.color_schemes[0]
    else:
        color_scheme = next(
            (cs for cs in template.color_schemes if cs.name.lower() == color_scheme_name.lower()),
            template.color_schemes[0]
        )
    
    css = template.css_template.format(
        primary=color_scheme.primary,
        secondary=color_scheme.secondary,
        accent=color_scheme.accent,
        background=color_scheme.background,
        text=color_scheme.text,
        text_secondary=color_scheme.text_secondary
    )
    
    return css

def list_templates() -> Dict[str, Any]:
    return {
        name: {
            "name": template.name,
            "description": template.description,
            "layouts": template.layouts,
            "color_schemes": [
                {
                    "name": cs.name,
                    "colors": {
                        "primary": cs.primary,
                        "accent": cs.accent,
                        "background": cs.background
                    }
                } for cs in template.color_schemes
            ]
        }
        for name, template in TEMPLATES.items()
    } 