from agentpress.tool import ToolResult, openapi_schema, usage_example
from sandbox.tool_base import SandboxToolsBase
from agentpress.thread_manager import ThreadManager
from typing import List, Dict, Optional
import json


class SandboxPresentationOutlineTool(SandboxToolsBase):
    def __init__(self, project_id: str, thread_manager: ThreadManager):
        super().__init__(project_id, thread_manager)

    @openapi_schema({
        "type": "function",
        "function": {
            "name": "create_presentation_outline",
            "description": "Create a structured outline for a presentation with slide titles and descriptions. This tool helps plan the overall structure and flow of a presentation before creating the actual slides.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The main title of the presentation"
                    },
                    "subtitle": {
                        "type": "string",
                        "description": "Optional subtitle or tagline for the presentation"
                    },
                    "slides": {
                        "type": "array",
                        "description": "Array of slide outlines with title and description",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "The title of the slide"
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Brief description of the slide content and purpose"
                                },
                                "notes": {
                                    "type": "string",
                                    "description": "Optional speaker notes or additional context"
                                }
                            },
                            "required": ["title", "description"]
                        }
                    }
                },
                "required": ["title", "slides"]
            }
        }
    })
    @usage_example('''
        <function_calls>
        <invoke name="create_presentation_outline">
        <parameter name="title">The Future of AI</parameter>
        <parameter name="subtitle">Transforming how we work, create, and connect</parameter>
        <parameter name="slides">[
            {
                "title": "The Future of AI",
                "description": "Hero slide with striking AI imagery and title overlay, setting the tone for an Apple-style keynote presentation.",
                "notes": "Open with confidence. Use full-screen image of neural networks or futuristic AI visualization. Keep title bold and impactful."
            },
            {
                "title": "Revolutionary Technology",
                "description": "Content slide showcasing key AI capabilities with supporting visuals, using image-right layout for balanced information delivery.",
                "notes": "Highlight the four key areas: neural networks, automation, creativity, and connectivity. Use brain/tech imagery."
            },
            {
                "title": "Breakthrough",
                "description": "Minimal slide with large, bold text asking a thought-provoking question about what makes this AI moment unique.",
                "notes": "Pause for emphasis. Use Apple's signature blue background. Let the question sink in before continuing."
            },
            {
                "title": "Real-World Impact",
                "description": "Showcase concrete AI applications across industries with image-left layout, featuring healthcare, transportation, climate, and education.",
                "notes": "Use compelling imagery of doctors with AI, autonomous vehicles, renewable energy, and personalized learning."
            },
            {
                "title": "The Road Ahead",
                "description": "Inspirational slide with an elegant quote and forward-looking message about human potential, using centered layout.",
                "notes": "Quote: 'The best way to predict the future is to invent it.' Connect technology to human aspirations."
            },
            {
                "title": "Thank You",
                "description": "Clean, minimal closing slide inviting questions, maintaining the sophisticated Apple aesthetic.",
                "notes": "Keep it simple. Dark background, white text. Create space for audience engagement."
            }
        ]</parameter>
        </invoke>
        </function_calls>
    ''')
    async def create_presentation_outline(
        self,
        title: str,
        slides: List[Dict[str, str]],
        subtitle: Optional[str] = None
    ) -> ToolResult:
        try:
            if not title:
                return self.fail_response("Presentation title is required.")
            
            if not slides or not isinstance(slides, list):
                return self.fail_response("At least one slide outline is required.")
            
            for i, slide in enumerate(slides):
                if not isinstance(slide, dict):
                    return self.fail_response(f"Slide {i+1} must be a dictionary with 'title' and 'description'.")
                
                if not slide.get("title"):
                    return self.fail_response(f"Slide {i+1} is missing a title.")
                
                if not slide.get("description"):
                    return self.fail_response(f"Slide {i+1} is missing a description.")
            
            outline_text = f"# {title}\n"
            if subtitle:
                outline_text += f"## {subtitle}\n"
            outline_text += f"\nTotal slides: {len(slides)}\n\n"
            
            for i, slide in enumerate(slides, 1):
                outline_text += f"### Slide {i}: {slide['title']}\n"
                outline_text += f"**Description:** {slide['description']}\n"
                if slide.get('notes'):
                    outline_text += f"**Notes:** {slide['notes']}\n"
                outline_text += "\n"
            
            return self.success_response({
                "title": title,
                "subtitle": subtitle,
                "slide_count": len(slides),
                "slides": slides,
                "outline_text": outline_text
            })
            
        except Exception as e:
            return self.fail_response(f"Failed to create presentation outline: {str(e)}") 