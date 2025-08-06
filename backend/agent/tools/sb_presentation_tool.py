from agentpress.tool import ToolResult, openapi_schema, usage_example
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from typing import List, Dict, Optional, Union
import json
import os
import base64
from datetime import datetime
import requests
import tempfile
import aspose.slides as slides
import aspose.pydrawing as draw
import re
from html import unescape
import io

from .presentation_templates import get_template_css, list_templates, get_template

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("PIL/Pillow not available - WEBP images will be skipped in PPTX export")

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

    def _generate_slide_html(self, slide: Dict, slide_number: int, total_slides: int, presentation_title: str, template_css: str = None) -> str:
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
        
        css_content = template_css if template_css else self._get_minimal_css(background_color, text_color)
        
        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - {presentation_title}</title>
    <style>
{css_content}
    </style>
</head>
<body>
    <div class="slide {layout}">
        {self._get_layout_structure(content_html, title, layout)}
        <div class="slide-number">{slide_number} / {total_slides}</div>
    </div>
</body>
</html>"""
        return html

    def _get_minimal_css(self, background_color: str, text_color: str) -> str:
        return f"""
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: {background_color};
            color: {text_color};
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }}
        .slide {{ 
            width: 100%;
            height: 100%;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }}
        .slide-number {{ 
            position: absolute; 
            bottom: 1rem; 
            right: 1rem; 
            opacity: 0.6; 
        }}
        """

    def _get_layout_structure(self, content_html: str, title: str, layout: str) -> str:
        if layout == "image-hero":
            return content_html
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
        
        if content.get("subtitle"):
            html_parts.append(f'<div class="subtitle">{content["subtitle"]}</div>')
        
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
            else:
                html_parts.append(f'<div class="two-column"><div>{content_text}</div>{image_html}</div>')
        
        else:
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
            "description": "Create a professional presentation using premium hardcoded templates. Choose from 'minimal' (Apple Keynote style), 'corporate' (business/data), or 'creative' (artistic/visual). Templates ensure uniformity and professional design with 16:9 dimensions.",
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
                    "template": {
                        "type": "string",
                        "enum": ["minimal", "corporate", "creative"],
                        "description": "Template to use: 'minimal' (clean Apple style), 'corporate' (professional business), 'creative' (artistic storytelling)",
                        "default": "minimal"
                    },
                    "color_scheme": {
                        "type": "string",
                        "description": "Color scheme name (e.g., 'Dark', 'Light', 'Blue' for minimal template). If not specified, uses template's default."
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
                                    "description": "Layout style from template. Minimal: hero, content, image-split, quote, minimal. Corporate: title, agenda, content, data. Creative: image-hero, gallery, story, quote"
                                }
                            },
                            "required": ["title", "content", "layout"]
                        }
                    }
                },
                "required": ["presentation_name", "title", "template", "slides"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="create_presentation">
        <parameter name="presentation_name">ai_future_presentation</parameter>
        <parameter name="title">The Future of AI</parameter>
        <parameter name="template">minimal</parameter>
        <parameter name="color_scheme">Dark</parameter>
        <parameter name="slides">[
            {
                "title": "The Future of AI",
                "content": {
                    "subtitle": "Transforming how we work, create, and connect"
                },
                "layout": "hero"
            },
            {
                "title": "Revolutionary Technology",
                "content": {
                    "subtitle": "AI is reshaping every industry",
                    "main_points": [
                        {"emoji": "🧠", "text": "Advanced neural networks that learn and adapt"},
                        {"emoji": "🎯", "text": "Precision automation for complex tasks"},
                        {"emoji": "🎨", "text": "Creative tools for art and content generation"},
                        {"emoji": "🔬", "text": "Scientific breakthroughs in research"}
                    ]
                },
                "layout": "content"
            },
            {
                "title": "The Question",
                "content": "What if we could augment human intelligence instead of replacing it?",
                "layout": "minimal"
            },
            {
                "title": "Human-AI Partnership",
                "content": {
                    "subtitle": "The future is collaborative",
                    "main_points": [
                        {"emoji": "👥", "text": "AI amplifies human creativity"},
                        {"emoji": "⚡", "text": "Faster decision-making"},
                        {"emoji": "🌍", "text": "Global problem-solving at scale"}
                    ],
                    "image": "https://images.unsplash.com/photo-1485827404703-89b55fcc595e"
                },
                "layout": "image-split"
            }
        ]</parameter>
        </invoke>
        </function_calls>
    ''')
    async def create_presentation(
        self,
        presentation_name: str,
        title: str,
        template: str,
        slides: List[Dict],
        color_scheme: Optional[str] = None
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
            
            template_css = get_template_css(template, color_scheme)
            
            slide_files = []
            slide_info = []
            
            for i, slide in enumerate(slides, 1):
                slide_html = self._generate_slide_html(slide, i, len(slides), title, template_css)
                
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
                "template": template,
                "color_scheme": color_scheme,
                "total_slides": len(slides),
                "created_at": datetime.now().isoformat(),
                "slides": slide_info,
                "index_file": index_path,
                "original_slides_data": slides,
                "template_css": template_css
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
    def _clean_html_text(self, html_text: str) -> str:
        """Clean HTML text and extract plain text"""
        # Remove HTML tags
        clean = re.compile('<.*?>')
        text = re.sub(clean, '', html_text)
        text = unescape(text)
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def _hex_to_rgb(self, hex_color: str) -> tuple:
        if not hex_color.startswith('#'):
            return (45, 45, 47)
        try:
            hex_color = hex_color[1:]
            return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        except:
            return (45, 45, 47)

    async def _download_image_for_pptx(self, url: str) -> Optional[bytes]:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = requests.get(url, timeout=10, headers=headers)
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '')
            if not content_type.startswith('image/'):
                return None
            
            image_data = response.content
            
            if PIL_AVAILABLE:
                try:
                    with Image.open(io.BytesIO(image_data)) as img:
                        if img.format in ['WEBP'] or img.format not in ['JPEG', 'PNG', 'GIF', 'BMP', 'TIFF']:
                            print(f"Converting image from {img.format} to JPEG for PPTX compatibility")
                            if img.mode in ['RGBA', 'LA', 'P']:
                                background = Image.new('RGB', img.size, (255, 255, 255))
                                if img.mode == 'P':
                                    img = img.convert('RGBA')
                                background.paste(img, mask=img.split()[-1] if img.mode in ['RGBA', 'LA'] else None)
                                img = background
                            elif img.mode != 'RGB':
                                img = img.convert('RGB')
                            
                            output = io.BytesIO()
                            img.save(output, format='JPEG', quality=85)
                            return output.getvalue()
                    
                    return image_data
                    
                except Exception as convert_error:
                    print(f"Error converting image format: {convert_error}")
                    return image_data
            else:
                if 'webp' in content_type.lower():
                    print("WEBP image detected but PIL not available - skipping image")
                    return None
                return image_data
                
        except Exception as e:
            print(f"Error downloading image: {e}")
            return None

    async def _create_pptx_presentation(self, metadata: Dict, slides_data: List[Dict], color_scheme = None) -> bytes:
        prs = slides.Presentation()
        prs.slide_size.set_size(slides.SlideSizeType.ON_SCREEN_16X9, slides.SlideSizeScaleType.MAXIMIZE)
        
        prs.slides.remove_at(0)
        
        for i, slide_data in enumerate(slides_data):
            slide = prs.slides.add_empty_slide(prs.layout_slides[6])
            
            title = slide_data.get('title', f'Slide {i+1}')
            content = slide_data.get('content', {})
            layout = slide_data.get('layout', 'default')
            bg_color = slide_data.get('background_color', '#1D1D1F')
            text_color = slide_data.get('text_color', '#FFFFFF')
            
            background = slide.background
            fill = background.fill_format
            fill.fill_type = slides.FillType.SOLID
            rgb = self._hex_to_rgb(bg_color)
            fill.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
            
            try:
                if layout == 'image-hero' and isinstance(content, dict) and content.get('hero_image'):
                    await self._add_hero_slide_aspose(slide, title, content, text_color, prs, color_scheme)
                elif layout == 'minimal':
                    self._add_minimal_slide_aspose(slide, title, content, text_color, color_scheme)
                else:
                    await self._add_standard_slide_aspose(slide, title, content, layout, text_color, color_scheme)
            except Exception as e:
                raise Exception(f"Error adding slide {i+1} with layout '{layout}': {str(e)}")
        
        with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as tmp_file:
            prs.save(tmp_file.name, slides.export.SaveFormat.PPTX)
            tmp_file.close()
            
            with open(tmp_file.name, 'rb') as f:
                data = f.read()
            os.unlink(tmp_file.name)
            return data

    async def _add_hero_slide_aspose(self, slide, title: str, content: Dict, text_color: str, prs, color_scheme=None):
        hero_image_url = content.get('hero_image')
        if hero_image_url:
            image_data = await self._download_image_for_pptx(hero_image_url)
            if image_data:
                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
                    tmp_img.write(image_data)
                    tmp_img.flush()
                    
                    with open(tmp_img.name, 'rb') as img_file:
                        pptx_image = prs.images.add_image(img_file)
                    
                    slide.shapes.add_picture_frame(slides.ShapeType.RECTANGLE, 0, 0, 
                                                 prs.slide_size.size.width, 
                                                 prs.slide_size.size.height, 
                                                 pptx_image)
                    os.unlink(tmp_img.name)
        
        title_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 50, 200, 600, 150)
        title_box.fill_format.fill_type = slides.FillType.NO_FILL
        title_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
        
        title_frame = title_box.text_frame
        title_frame.text = self._clean_html_text(content.get('title', title))
        
        title_para = title_frame.paragraphs[0]
        title_portion = title_para.portions[0]
        title_portion.portion_format.font_height = 48
        title_portion.portion_format.font_bold = slides.NullableBool.TRUE
        rgb = self._hex_to_rgb(text_color)
        title_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
        title_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
        
        if content.get('subtitle'):
            subtitle_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 50, 350, 600, 100)
            subtitle_box.fill_format.fill_type = slides.FillType.NO_FILL
            subtitle_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
            
            subtitle_frame = subtitle_box.text_frame
            subtitle_frame.text = self._clean_html_text(content['subtitle'])
            
            subtitle_para = subtitle_frame.paragraphs[0]
            subtitle_portion = subtitle_para.portions[0]
            subtitle_portion.portion_format.font_height = 24
            if color_scheme and hasattr(color_scheme, 'accent'):
                accent_rgb = self._hex_to_rgb(color_scheme.accent)
                subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, accent_rgb[0], accent_rgb[1], accent_rgb[2])
            else:
                subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])

    def _add_minimal_slide_aspose(self, slide, title: str, content, text_color: str, color_scheme=None):
        title_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 50, 200, 850, 200)
        title_box.fill_format.fill_type = slides.FillType.NO_FILL
        title_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
        
        title_frame = title_box.text_frame
        title_frame.text = self._clean_html_text(title)
        
        title_para = title_frame.paragraphs[0]
        title_para.paragraph_format.alignment = slides.TextAlignment.CENTER
        title_portion = title_para.portions[0]
        title_portion.portion_format.font_height = 54
        title_portion.portion_format.font_bold = slides.NullableBool.TRUE
        rgb = self._hex_to_rgb(text_color)
        title_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
        title_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
        
        if isinstance(content, dict) and content.get('subtitle'):
            subtitle_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 50, 400, 850, 120)
            subtitle_box.fill_format.fill_type = slides.FillType.NO_FILL
            subtitle_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
            
            subtitle_frame = subtitle_box.text_frame
            subtitle_frame.text = self._clean_html_text(content['subtitle'])
            
            subtitle_para = subtitle_frame.paragraphs[0]
            subtitle_para.paragraph_format.alignment = slides.TextAlignment.CENTER
            subtitle_portion = subtitle_para.portions[0]
            subtitle_portion.portion_format.font_height = 28
            if color_scheme and hasattr(color_scheme, 'accent'):
                accent_rgb = self._hex_to_rgb(color_scheme.accent)
                subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, accent_rgb[0], accent_rgb[1], accent_rgb[2])
            else:
                subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])

    async def _add_standard_slide_aspose(self, slide, title: str, content, layout: str, text_color: str, color_scheme=None):
        rgb = self._hex_to_rgb(text_color)
        
        title_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 40, 40, 880, 90)
        title_box.fill_format.fill_type = slides.FillType.NO_FILL
        title_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
        
        title_frame = title_box.text_frame
        title_frame.text = self._clean_html_text(title)
        
        title_para = title_frame.paragraphs[0]
        title_portion = title_para.portions[0]
        title_portion.portion_format.font_height = 36
        title_portion.portion_format.font_bold = slides.NullableBool.TRUE
        title_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
        title_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
        
        content_top = 150
        
        if isinstance(content, dict):
            if content.get('subtitle'):
                subtitle_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 40, content_top, 880, 60)
                subtitle_box.fill_format.fill_type = slides.FillType.NO_FILL
                subtitle_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
                
                subtitle_frame = subtitle_box.text_frame
                subtitle_frame.text = self._clean_html_text(content['subtitle'])
                
                subtitle_para = subtitle_frame.paragraphs[0]
                subtitle_portion = subtitle_para.portions[0]
                subtitle_portion.portion_format.font_height = 24
                if color_scheme and hasattr(color_scheme, 'accent'):
                    accent_rgb = self._hex_to_rgb(color_scheme.accent)
                    subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                    subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, accent_rgb[0], accent_rgb[1], accent_rgb[2])
                else:
                    subtitle_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                    subtitle_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
                content_top += 70
            
            if content.get('main_points'):
                text_box = slide.shapes.add_auto_shape(slides.ShapeType.RECTANGLE, 40, content_top, 500, 300)
                text_box.fill_format.fill_type = slides.FillType.NO_FILL
                text_box.line_format.fill_format.fill_type = slides.FillType.NO_FILL
                
                text_frame = text_box.text_frame
                text_frame.paragraphs.clear()
                
                for i, point in enumerate(content['main_points']):
                    if isinstance(point, dict):
                        emoji = point.get('emoji', '•')
                        text = point.get('text', '')
                    else:
                        emoji = '•'
                        text = str(point)
                    
                    para = slides.Paragraph()
                    para.text = f"{emoji} {self._clean_html_text(text)}"
                    
                    # Format the portion
                    portion = para.portions[0]
                    portion.portion_format.font_height = 20
                    portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                    portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
                    para.paragraph_format.space_after = 12
                    
                    if color_scheme and hasattr(color_scheme, 'accent') and emoji:
                        try:
                            para.portions.clear()
                            
                            emoji_portion = slides.Portion()
                            emoji_portion.text = emoji + " "
                            emoji_portion.portion_format.font_height = 20
                            accent_rgb = self._hex_to_rgb(color_scheme.accent)
                            emoji_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                            emoji_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, accent_rgb[0], accent_rgb[1], accent_rgb[2])
                            para.portions.add(emoji_portion)
                            
                            text_portion = slides.Portion()
                            text_portion.text = self._clean_html_text(text)
                            text_portion.portion_format.font_height = 20
                            text_portion.portion_format.fill_format.fill_type = slides.FillType.SOLID
                            text_portion.portion_format.fill_format.solid_fill_color.color = draw.Color.from_argb(255, rgb[0], rgb[1], rgb[2])
                            para.portions.add(text_portion)
                        except:
                            pass
                    
                    text_frame.paragraphs.add(para)
            
            if content.get('image') and layout in ['image-right', 'image-left', 'default']:
                image_data = await self._download_image_for_pptx(content['image'])
                if image_data:
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
                        tmp_img.write(image_data)
                        tmp_img.flush()
                        
                        with open(tmp_img.name, 'rb') as img_file:
                            pptx_image = slide.presentation.images.add_image(img_file)
                        
                        if layout == 'image-right':
                            slide.shapes.add_picture_frame(slides.ShapeType.RECTANGLE, 560, content_top, 320, 220, pptx_image)
                        elif layout == 'image-left':
                            slide.shapes.add_picture_frame(slides.ShapeType.RECTANGLE, 40, content_top, 320, 220, pptx_image)
                        else:
                            slide.shapes.add_picture_frame(slides.ShapeType.RECTANGLE, 40, content_top + 140, 430, 220, pptx_image)
                        
                        os.unlink(tmp_img.name)

    async def export_presentation(
        self,
        presentation_name: str,
        format: str = "pptx"
    ) -> ToolResult:
        try:
            await self._ensure_sandbox()
            safe_name = "".join(c for c in presentation_name if c.isalnum() or c in "-_").lower()
            presentation_dir = f"{self.presentations_dir}/{safe_name}"
            
            metadata_path = f"{self.workspace_path}/{presentation_dir}/metadata.json"
            try:
                metadata_content = await self.sandbox.fs.download_file(metadata_path)
                metadata = json.loads(metadata_content.decode())
            except Exception as e:
                return self.fail_response(f"Presentation '{presentation_name}' (safe_name: '{safe_name}') not found at path '{metadata_path}'. Error: {str(e)}")
            
            if format.lower() == "pptx":
                slides_data = metadata.get('original_slides_data', [])
                
                template_name = metadata.get('template', 'minimal')
                color_scheme_name = metadata.get('color_scheme')
                
                template = get_template(template_name)
                if color_scheme_name:
                    color_scheme = next(
                        (cs for cs in template.color_schemes if cs.name.lower() == color_scheme_name.lower()),
                        template.color_schemes[0]
                    )
                else:
                    color_scheme = template.color_schemes[0]
                
                if not slides_data:
                    slides_data = []
                    for slide_info in metadata.get('slides', []):
                        slides_data.append({
                            'title': slide_info.get('title', f"Slide {slide_info.get('slide_number', 1)}"),
                            'content': {'subtitle': 'Content from HTML slide'},
                            'layout': 'default',
                            'background_color': color_scheme.background,
                            'text_color': color_scheme.text
                        })
                else:
                    for slide in slides_data:
                        if 'background_color' not in slide:
                            slide['background_color'] = color_scheme.background
                        if 'text_color' not in slide:
                            slide['text_color'] = color_scheme.text
                
                try:
                    pptx_data = await self._create_pptx_presentation(metadata, slides_data, color_scheme)
                except Exception as e:
                    return self.fail_response(f"PPTX generation failed: {str(e)}")
                
                pptx_filename = f"{safe_name}.pptx"
                pptx_path = f"{presentation_dir}/{pptx_filename}"
                full_pptx_path = f"{self.workspace_path}/{pptx_path}"
                
                print(f"PPTX Debug - safe_name: {safe_name}")
                print(f"PPTX Debug - pptx_filename: {pptx_filename}")
                print(f"PPTX Debug - pptx_path: {pptx_path}")
                print(f"PPTX Debug - full_pptx_path: {full_pptx_path}")
                print(f"PPTX Debug - pptx_data size: {len(pptx_data)} bytes")
                
                await self.sandbox.fs.upload_file(pptx_data, full_pptx_path)
                
                try:
                    file_info = await self.sandbox.fs.get_file_info(full_pptx_path)
                    print(f"PPTX Debug - File created successfully: {file_info.size} bytes")
                except Exception as e:
                    print(f"PPTX Debug - Error verifying file: {str(e)}")
                    return self.fail_response(f"Failed to verify PPTX file creation: {str(e)}")
                
                return self.success_response({
                    "message": f"Presentation exported successfully as PPTX",
                    "export_file": pptx_path,
                    "download_url": f"/workspace/{pptx_path}",
                    "format": "pptx",
                    "presentation_name": presentation_name,
                    "file_size": len(pptx_data)
                })
            else:
                return self.fail_response(f"Export format '{format}' not yet implemented. Only PPTX is currently supported.")
            
        except ImportError:
            return self.fail_response("PPTX export requires 'aspose-slides' library. Please install it: pip install aspose-slides")
        except Exception as e:
            return self.fail_response(f"Failed to export presentation: {str(e)}")

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "list_presentation_templates",
            "description": "List all available presentation templates with their layouts and color schemes",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="list_presentation_templates">
        </invoke>
        </function_calls>
    ''')
    async def list_presentation_templates(self) -> ToolResult:
        try:
            templates_info = list_templates()
            return self.success_response({
                "message": "Available presentation templates",
                "templates": templates_info
            })
        except Exception as e:
            return self.fail_response(f"Failed to list templates: {str(e)}") 