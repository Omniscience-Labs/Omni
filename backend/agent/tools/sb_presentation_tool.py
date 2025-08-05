from agentpress.tool import ToolResult, openapi_schema, usage_example
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from typing import List, Dict, Optional, Union
import json
import os
import base64
from datetime import datetime


class SandboxPresentationTool(SandboxToolsBase):
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)
        self.workspace_path = "/workspace"
        self.presentations_dir = "presentations"

    async def _ensure_presentations_dir(self):
        full_path = f"{self.workspace_path}/{self.presentations_dir}"
        try:
            await self.sandbox.fs.create_folder(full_path, "755")
        except:
            pass

    def _generate_slide_html(self, slide: Dict, slide_number: int, total_slides: int, presentation_title: str) -> str:
        title = slide.get("title", f"Slide {slide_number}")
        content = slide.get("content", "")
        layout = slide.get("layout", "default")
        background_color = slide.get("background_color", "#1D1D1F")
        text_color = slide.get("text_color", "#FFFFFF")
        
        if isinstance(content, dict):
            content_html = self._render_structured_content(content, layout)
        elif isinstance(content, list):
            content_html = self._render_list_content(content)
        else:
            content_html = f'<div class="content">{content}</div>'
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - {presentation_title}</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', 'Arial', sans-serif;
            background: {background_color};
            color: {text_color};
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
            font-weight: 400;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }}
        
        .slide {{
            width: 100vw;
            height: 100vh;
            padding: 80px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            position: relative;
            background: {background_color};
            overflow: hidden;
        }}
        
        .slide.hero {{
            background: linear-gradient(135deg, {background_color} 0%, {self._adjust_color(background_color, 0.8)} 100%);
        }}
        
        .slide.image-hero {{
            padding: 0;
            background: #000;
        }}
        
        .slide.split-content {{
            flex-direction: row;
            gap: 80px;
            align-items: center;
        }}
        
        .slide.image-background {{
            padding: 80px;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }}
        
        .slide.minimal {{
            justify-content: center;
            align-items: center;
            text-align: center;
        }}
        
        .slide-number {{
            position: absolute;
            bottom: 40px;
            right: 80px;
            font-size: 16px;
            opacity: 0.6;
            font-weight: 500;
        }}
        
        h1 {{
            font-size: clamp(3rem, 8vw, 6rem);
            font-weight: 600;
            margin-bottom: 40px;
            line-height: 1.1;
            letter-spacing: -0.02em;
            max-width: 90%;
        }}
        
        .slide.minimal h1 {{
            font-size: clamp(4rem, 10vw, 8rem);
            font-weight: 700;
            margin-bottom: 0;
        }}
        
        h2 {{
            font-size: clamp(1.8rem, 4vw, 3rem);
            font-weight: 500;
            margin-bottom: 30px;
            opacity: 0.9;
            letter-spacing: -0.01em;
            line-height: 1.2;
        }}
        
        h3 {{
            font-size: clamp(1.4rem, 3vw, 2.2rem);
            font-weight: 500;
            margin-bottom: 20px;
            opacity: 0.85;
            letter-spacing: -0.005em;
        }}
        
        .content {{
            font-size: clamp(1.2rem, 2.5vw, 1.8rem);
            line-height: 1.5;
            opacity: 0.9;
            font-weight: 400;
        }}
        
        .subtitle {{
            font-size: clamp(1.6rem, 3.5vw, 2.5rem);
            font-weight: 300;
            opacity: 0.8;
            margin-bottom: 60px;
            line-height: 1.3;
            letter-spacing: -0.01em;
        }}
        
        ul, ol {{
            list-style: none;
            margin: 40px 0;
            padding: 0;
        }}
        
        li {{
            margin: 24px 0;
            font-size: clamp(1.3rem, 2.8vw, 2rem);
            line-height: 1.4;
            display: flex;
            align-items: center;
            font-weight: 400;
        }}
        
        .emoji {{
            font-size: 1.4em;
            margin-right: 16px;
            display: inline-block;
            min-width: 1.4em;
        }}
        
        .image-container {{
            position: relative;
            overflow: hidden;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }}
        
        .hero-image {{
            width: 100%;
            height: 100vh;
            object-fit: cover;
            object-position: center;
        }}
        
        .content-image {{
            width: 100%;
            height: auto;
            max-height: 500px;
            object-fit: cover;
            object-position: center;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }}
        
        .side-image {{
            width: 100%;
            height: 600px;
            object-fit: cover;
            object-position: center;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }}
        
        .text-overlay {{
            position: absolute;
            top: 50%;
            left: 80px;
            transform: translateY(-50%);
            z-index: 10;
            max-width: 60%;
        }}
        
        .text-overlay h1 {{
            text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            margin-bottom: 20px;
        }}
        
        .text-overlay .subtitle {{
            text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            margin-bottom: 0;
        }}
        
        .content-grid {{
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: 80px;
            align-items: center;
            height: 100%;
        }}
        
        .content-grid.reverse {{
            grid-template-columns: 1fr 1.2fr;
        }}
        
        .split-content .content-column {{
            flex: 1;
        }}
        
        .two-column {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 80px;
            align-items: center;
            height: 100%;
        }}
        
        .image-right {{
            display: grid;
            grid-template-columns: 1.5fr 1fr;
            gap: 80px;
            align-items: center;
            height: 100%;
        }}
        
        .image-left {{
            display: grid;
            grid-template-columns: 1fr 1.5fr;
            gap: 80px;
            align-items: center;
            height: 100%;
        }}
        
        .centered {{
            text-align: center;
            max-width: 80%;
            margin: 0 auto;
        }}
        
        .quote {{
            font-size: clamp(1.8rem, 4vw, 3rem);
            font-weight: 300;
            font-style: italic;
            line-height: 1.3;
            text-align: center;
            opacity: 0.9;
            margin: 60px 0;
            position: relative;
        }}
        
        .quote::before {{
            content: '"';
            font-size: 1.5em;
            opacity: 0.5;
            position: absolute;
            left: -0.5em;
            top: -0.2em;
        }}
        
        .quote::after {{
            content: '"';
            font-size: 1.5em;
            opacity: 0.5;
            position: absolute;
            right: -0.5em;
            bottom: -0.2em;
        }}
        
        .highlight {{
            background: linear-gradient(120deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.1) 100%);
            padding: 4px 12px;
            border-radius: 8px;
            font-weight: 500;
        }}
        
        .gradient-overlay {{
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.6) 100%);
            z-index: 5;
        }}
        
        .decorative-element {{
            position: absolute;
            opacity: 0.1;
            pointer-events: none;
            border-radius: 50%;
            background: radial-gradient(circle, currentColor 0%, transparent 70%);
        }}
        
        .decorative-element.top-left {{
            top: -20%;
            left: -20%;
            width: 40%;
            height: 40%;
        }}
        
        .decorative-element.bottom-right {{
            bottom: -20%;
            right: -20%;
            width: 50%;
            height: 50%;
        }}
        
        @media (max-width: 768px) {{
            .slide {{
                padding: 40px;
            }}
            
            .content-grid,
            .two-column,
            .image-right,
            .image-left,
            .split-content {{
                grid-template-columns: 1fr;
                flex-direction: column;
                gap: 40px;
            }}
            
            .text-overlay {{
                position: static;
                transform: none;
                max-width: 100%;
                margin-top: 40px;
            }}
            
            .slide-number {{
                right: 40px;
                bottom: 20px;
            }}
        }}
    </style>
</head>
<body>
    <div class="decorative-element top-left"></div>
    <div class="decorative-element bottom-right"></div>
    
    <div class="slide {layout}">
        {self._get_layout_structure(content_html, title, layout)}
        <div class="slide-number">{slide_number} / {total_slides}</div>
    </div>
</body>
</html>"""
        return html

    def _get_layout_structure(self, content_html: str, title: str, layout: str) -> str:
        if layout == "image-hero":
            return content_html  # Image hero handles its own structure
        elif layout == "minimal":
            return f"""
                <div class="centered">
                    <h1>{title}</h1>
                    {content_html}
                </div>
            """
        elif layout in ["image-right", "image-left", "two-column"]:
            return f"""
                <div class="content-section">
                    <h1>{title}</h1>
                </div>
                {content_html}
            """
        else:
            return f"""
                <h1>{title}</h1>
                {content_html}
            """

    def _render_structured_content(self, content: Dict, layout: str = "default") -> str:
        html_parts = []
        
        # Handle image hero layout
        if layout == "image-hero" and content.get("hero_image"):
            return f"""
                <div class="image-container">
                    <img src="{content['hero_image']}" alt="Hero image" class="hero-image">
                    <div class="gradient-overlay"></div>
                    <div class="text-overlay">
                        <h1>{content.get('title', '')}</h1>
                        {f'<div class="subtitle">{content["subtitle"]}</div>' if content.get("subtitle") else ''}
                    </div>
                </div>
            """
        
        # Handle subtitle
        if content.get("subtitle"):
            html_parts.append(f'<div class="subtitle">{content["subtitle"]}</div>')
        
        # Handle structured layouts with images
        if layout in ["image-right", "image-left", "two-column"] and content.get("image"):
            content_section = []
            
            if content.get("main_points"):
                content_section.append('<ul>')
                for point in content["main_points"]:
                    emoji = point.get("emoji", "") if isinstance(point, dict) else ""
                    text = point.get("text", point) if isinstance(point, dict) else point
                    content_section.append(f'<li><span class="emoji">{emoji}</span>{text}</li>')
                content_section.append('</ul>')
            
            if content.get("additional_text"):
                content_section.append(f'<div class="content">{content["additional_text"]}</div>')
            
            image_html = f'<div class="image-container"><img src="{content["image"]}" alt="Slide image" class="side-image"></div>'
            content_text = '\n'.join(content_section)
            
            if layout == "image-right":
                html_parts.append(f'<div class="content-grid"><div>{content_text}</div>{image_html}</div>')
            elif layout == "image-left":
                html_parts.append(f'<div class="content-grid reverse">{image_html}<div>{content_text}</div></div>')
            else:  # two-column
                html_parts.append(f'<div class="two-column"><div>{content_text}</div>{image_html}</div>')
        
        else:
            # Standard content rendering
            if content.get("main_points"):
                html_parts.append('<ul>')
                for point in content["main_points"]:
                    emoji = point.get("emoji", "") if isinstance(point, dict) else ""
                    text = point.get("text", point) if isinstance(point, dict) else point
                    html_parts.append(f'<li><span class="emoji">{emoji}</span>{text}</li>')
                html_parts.append('</ul>')
            
            if content.get("image") and layout not in ["image-right", "image-left", "two-column"]:
                html_parts.append(f'<div class="image-container"><img src="{content["image"]}" alt="Slide image" class="content-image"></div>')
            
            if content.get("quote"):
                html_parts.append(f'<div class="quote">{content["quote"]}</div>')
            
            if content.get("additional_text"):
                html_parts.append(f'<div class="content">{content["additional_text"]}</div>')
        
        return '\n'.join(html_parts)

    def _render_list_content(self, items: List) -> str:
        html_parts = ['<ul>']
        for item in items:
            if isinstance(item, dict):
                emoji = item.get("emoji", "")
                text = item.get("text", "")
                html_parts.append(f'<li><span class="emoji">{emoji}</span>{text}</li>')
            else:
                html_parts.append(f'<li>{item}</li>')
        html_parts.append('</ul>')
        return '\n'.join(html_parts)

    def _adjust_color(self, color: str, factor: float) -> str:
        if not color.startswith('#'):
            return color
        
        try:
            hex_color = color[1:]
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            r = int(min(255, max(0, r * factor)))
            g = int(min(255, max(0, g * factor)))
            b = int(min(255, max(0, b * factor)))
            
            return f"#{r:02x}{g:02x}{b:02x}"
        except:
            return color

    def _generate_presentation_index(self, title: str, slides: List[str]) -> str:
        slide_links = []
        for i, slide_file in enumerate(slides, 1):
            slide_links.append(f'<li><a href="{slide_file}">Slide {i}</a></li>')
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Presentation Index</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }}
        h1 {{
            color: #333;
        }}
        ul {{
            list-style: none;
            padding: 0;
        }}
        li {{
            margin: 10px 0;
        }}
        a {{
            display: block;
            padding: 15px;
            background: white;
            border-radius: 8px;
            text-decoration: none;
            color: #5865F2;
            transition: all 0.3s;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        a:hover {{
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }}
    </style>
</head>
<body>
    <h1>{title}</h1>
    <h2>Slides</h2>
    <ul>
        {''.join(slide_links)}
    </ul>
</body>
</html>"""
        return html

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_presentation",
            "description": "Create a presentation with multiple slides based on a presentation outline. Each slide is generated as an HTML file with preview capabilities. The presentation can be exported as PDF or PPTX.",
            "parameters": {
                "type": "object",
                "properties": {
                    "presentation_name": {
                        "type": "string",
                        "description": "Name of the presentation (used for file naming)"
                    },
                    "title": {
                        "type": "string",
                        "description": "The main title of the presentation"
                    },
                    "slides": {
                        "type": "array",
                        "description": "Array of slides to create",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "The title of the slide"
                                },
                                "content": {
                                    "type": ["string", "object", "array"],
                                    "description": "The content of the slide. Can be plain text, HTML, or structured content object with hero_image, subtitle, main_points, image, quote, additional_text"
                                },
                                "layout": {
                                    "type": "string",
                                    "enum": ["default", "centered", "minimal", "hero", "image-hero", "image-right", "image-left", "two-column", "split-content"],
                                    "description": "Layout style: default (standard), centered (center-aligned), minimal (large centered text), hero (gradient bg), image-hero (fullscreen image with overlay text), image-right (text left, image right), image-left (image left, text right), two-column (equal columns), split-content (side-by-side)"
                                },
                                "background_color": {
                                    "type": "string",
                                    "description": "Background color in hex format (e.g., '#1D1D1F' for Apple dark, '#007AFF' for Apple blue)"
                                },
                                "text_color": {
                                    "type": "string",
                                    "description": "Text color in hex format (e.g., '#FFFFFF')"
                                }
                            },
                            "required": ["title", "content"]
                        }
                    }
                },
                "required": ["presentation_name", "title", "slides"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="create_presentation">
        <parameter name="presentation_name">apple_style_ai_presentation</parameter>
        <parameter name="title">The Future of AI</parameter>
        <parameter name="slides">[
            {
                "title": "The Future of AI",
                "content": {
                    "hero_image": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&h=900&fit=crop",
                    "title": "The Future of AI",
                    "subtitle": "Transforming how we work, create, and connect"
                },
                "layout": "image-hero",
                "background_color": "#1D1D1F"
            },
            {
                "title": "Revolutionary Technology",
                "content": {
                    "subtitle": "AI is reshaping every industry",
                    "main_points": [
                        {"emoji": "🧠", "text": "Advanced neural networks that learn and adapt"},
                        {"emoji": "🎯", "text": "Precision automation for complex tasks"},
                        {"emoji": "💡", "text": "Creative AI that generates art, music, and code"},
                        {"emoji": "🌐", "text": "Global connectivity through intelligent systems"}
                    ],
                    "image": "https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800&h=600&fit=crop"
                },
                "layout": "image-right",
                "background_color": "#1D1D1F"
            },
            {
                "title": "Breakthrough",
                "content": {
                    "subtitle": "What makes this moment different?"
                },
                "layout": "minimal",
                "background_color": "#007AFF"
            },
            {
                "title": "Real-World Impact",
                "content": {
                    "subtitle": "AI in action",
                    "image": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop",
                    "main_points": [
                        {"emoji": "⚕️", "text": "Medical diagnosis with superhuman accuracy"},
                        {"emoji": "🚗", "text": "Autonomous vehicles saving lives"},
                        {"emoji": "🌱", "text": "Climate solutions through smart optimization"},
                        {"emoji": "🎓", "text": "Personalized education for every learner"}
                    ]
                },
                "layout": "image-left",
                "background_color": "#1D1D1F"
            },
            {
                "title": "The Road Ahead",
                "content": {
                    "quote": "The best way to predict the future is to invent it.",
                    "additional_text": "We're not just building technology. We're crafting the future of human potential."
                },
                "layout": "centered",
                "background_color": "#2D2D30"
            },
            {
                "title": "Thank You",
                "content": {
                    "subtitle": "Questions?"
                },
                "layout": "minimal",
                "background_color": "#1D1D1F"
            }
        ]</parameter>
        </invoke>
        </function_calls>
    ''')
    async def create_presentation(
        self,
        presentation_name: str,
        title: str,
        slides: List[Dict]
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            await self._ensure_presentations_dir()
            
            if not presentation_name:
                return self.fail_response("Presentation name is required.")
            
            if not title:
                return self.fail_response("Presentation title is required.")
            
            if not slides or not isinstance(slides, list):
                return self.fail_response("At least one slide is required.")
            
            safe_name = "".join(c for c in presentation_name if c.isalnum() or c in "-_").lower()
            presentation_dir = f"{self.presentations_dir}/{safe_name}"
            full_presentation_path = f"{self.workspace_path}/{presentation_dir}"
            
            try:
                await self.sandbox.fs.create_folder(full_presentation_path, "755")
            except:
                pass
            
            slide_files = []
            slide_info = []
            
            for i, slide in enumerate(slides, 1):
                slide_html = self._generate_slide_html(slide, i, len(slides), title)
                
                slide_filename = f"slide_{i:02d}.html"
                slide_path = f"{presentation_dir}/{slide_filename}"
                full_slide_path = f"{self.workspace_path}/{slide_path}"
                
                await self.sandbox.fs.upload_file(slide_html.encode(), full_slide_path)
                slide_files.append(slide_filename)
                
                slide_info.append({
                    "slide_number": i,
                    "title": slide.get("title", f"Slide {i}"),
                    "file": slide_path,
                    "preview_url": f"/workspace/{slide_path}"
                })
            
            index_html = self._generate_presentation_index(title, slide_files)
            index_path = f"{presentation_dir}/index.html"
            full_index_path = f"{self.workspace_path}/{index_path}"
            await self.sandbox.fs.upload_file(index_html.encode(), full_index_path)
            
            metadata = {
                "presentation_name": presentation_name,
                "title": title,
                "total_slides": len(slides),
                "created_at": datetime.now().isoformat(),
                "slides": slide_info,
                "index_file": index_path
            }
            
            metadata_path = f"{presentation_dir}/metadata.json"
            full_metadata_path = f"{self.workspace_path}/{metadata_path}"
            await self.sandbox.fs.upload_file(json.dumps(metadata, indent=2).encode(), full_metadata_path)
            
            return self.success_response({
                "message": f"Presentation '{title}' created successfully with {len(slides)} slides",
                "presentation_path": presentation_dir,
                "index_file": index_path,
                "slides": slide_info,
                "presentation_name": presentation_name,
                "title": title,
                "total_slides": len(slides)
            })
            
        except Exception as e:
            return self.fail_response(f"Failed to create presentation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "export_presentation",
            "description": "Export a presentation to PDF or PPTX format. Note: This requires additional tools to be installed in the environment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "presentation_name": {
                        "type": "string",
                        "description": "Name of the presentation to export"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["pdf", "pptx"],
                        "description": "Export format"
                    }
                },
                "required": ["presentation_name", "format"]
            }
        }
    })
    async def export_presentation(
        self,
        presentation_name: str,
        format: str = "pdf"
    ) -> ToolResult:
        try:
            safe_name = "".join(c for c in presentation_name if c.isalnum() or c in "-_").lower()
            presentation_dir = f"{self.presentations_dir}/{safe_name}"
            
            metadata_path = f"{self.workspace_path}/{presentation_dir}/metadata.json"
            try:
                metadata_content = await self.sandbox.fs.download_file(metadata_path)
                metadata = json.loads(metadata_content.decode())
            except:
                return self.fail_response(f"Presentation '{presentation_name}' not found.")
            
            export_message = f"""
Export functionality placeholder:
- Format: {format.upper()}
- Presentation: {metadata['title']}
- Slides: {metadata['total_slides']}

To implement actual export:
- For PDF: Use puppeteer or wkhtmltopdf to convert HTML slides
- For PPTX: Use python-pptx to generate PowerPoint files
"""
            
            return self.success_response({
                "message": export_message,
                "action": "export_presentation",
                "format": format,
                "presentation_name": presentation_name
            })
            
        except Exception as e:
            return self.fail_response(f"Failed to export presentation: {str(e)}") 