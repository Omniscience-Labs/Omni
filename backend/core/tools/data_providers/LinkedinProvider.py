from typing import Dict

from core.tools.data_providers.RapidDataProviderBase import RapidDataProviderBase, EndpointSchema


class LinkedinProvider(RapidDataProviderBase):
    def __init__(self):
        endpoints: Dict[str, EndpointSchema] = {
            # User Profile Data Endpoints
            "get_user_profile": {
                "route": "/api/v1/user/profile",
                "method": "GET",
                "name": "Get User Profile",
                "description": "Retrieve general LinkedIn user profile information",
                "payload": {
                    "username": "LinkedIn username (from profile URL, e.g., 'john-doe-123456') (required)"
                }
            },
            "get_user_contact": {
                "route": "/api/v1/user/contact",
                "method": "GET",
                "name": "Get User Contact",
                "description": "Fetch user contact details including email, phone, address, and social media",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_posts": {
                "route": "/api/v1/user/posts",
                "method": "GET",
                "name": "Get User Posts",
                "description": "Retrieve user's LinkedIn posts with pagination",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_comments": {
                "route": "/api/v1/user/comments",
                "method": "GET",
                "name": "Get User Comments",
                "description": "Fetch user's comments on LinkedIn posts",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_videos": {
                "route": "/api/v1/user/videos",
                "method": "GET",
                "name": "Get User Videos",
                "description": "Retrieve user's LinkedIn videos",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_images": {
                "route": "/api/v1/user/images",
                "method": "GET",
                "name": "Get User Images",
                "description": "Retrieve user's images with metadata",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "pagination_token": "Pagination token for next page (optional)"
                }
            },
            "get_user_reactions": {
                "route": "/api/v1/user/reactions",
                "method": "GET",
                "name": "Get User Reactions",
                "description": "Fetch user's reactions on LinkedIn posts",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_documents": {
                "route": "/api/v1/user/documents",
                "method": "GET",
                "name": "Get User Documents",
                "description": "Retrieve user's documents with pagination",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_recommendations": {
                "route": "/api/v1/user/recommendations",
                "method": "GET",
                "name": "Get User Recommendations",
                "description": "Fetch user recommendations including recommender details",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_about": {
                "route": "/api/v1/user/about",
                "method": "GET",
                "name": "Get User About",
                "description": "Retrieve user's about section",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            
            # User Additional Data Endpoints
            "get_user_skills": {
                "route": "/api/v1/user/skills",
                "method": "GET",
                "name": "Get User Skills",
                "description": "Access user skills with endorsement counts and pagination",
                "payload": {
                    "username": "LinkedIn username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_user_education": {
                "route": "/api/v1/user/education",
                "method": "GET",
                "name": "Get User Education",
                "description": "Retrieve user's education history",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_licenses": {
                "route": "/api/v1/user/licenses",
                "method": "GET",
                "name": "Get User Licenses",
                "description": "Fetch user's licenses and certifications",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_publications": {
                "route": "/api/v1/user/publications",
                "method": "GET",
                "name": "Get User Publications",
                "description": "Retrieve user's publications",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_honors": {
                "route": "/api/v1/user/honors",
                "method": "GET",
                "name": "Get User Honors",
                "description": "Fetch user's honors and awards",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_experiences": {
                "route": "/api/v1/user/experiences",
                "method": "GET",
                "name": "Get User Experiences",
                "description": "Retrieve user's work experiences",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_volunteers": {
                "route": "/api/v1/user/volunteers",
                "method": "GET",
                "name": "Get User Volunteers",
                "description": "Fetch user's volunteer experiences",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            "get_user_follower_connection": {
                "route": "/api/v1/user/follower-connection",
                "method": "GET",
                "name": "Get User Follower and Connection",
                "description": "Get user's follower and connection counts",
                "payload": {
                    "username": "LinkedIn username (required)"
                }
            },
            
            # Search Endpoints
            "search_people": {
                "route": "/api/v1/search/people",
                "method": "GET",
                "name": "Search People",
                "description": "Search for LinkedIn profiles by keyword, name, or location",
                "payload": {
                    "keyword": "Search term for job title, skill, etc. (optional)",
                    "name": "Filter by person's name (optional)",
                    "location": "Geographic location filter (optional)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "search_posts": {
                "route": "/api/v1/search/posts",
                "method": "GET",
                "name": "Search Posts",
                "description": "Search for LinkedIn posts",
                "payload": {
                    "keyword": "Search keyword (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "search_location": {
                "route": "/api/v1/search/location",
                "method": "GET",
                "name": "Search Locations",
                "description": "Search for location suggestions",
                "payload": {
                    "keyword": "Location search keyword (required)"
                }
            },
            
            # Company Endpoints
            "get_company_profile": {
                "route": "/api/v1/company/profile",
                "method": "GET",
                "name": "Get Company Profile",
                "description": "Fetch LinkedIn company profile data",
                "payload": {
                    "username": "LinkedIn company username (from company URL) (required)"
                }
            },
            "get_company_posts": {
                "route": "/api/v1/company/posts",
                "method": "GET",
                "name": "Get Company Posts",
                "description": "Retrieve posts from a LinkedIn company page",
                "payload": {
                    "username": "LinkedIn company username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_company_people": {
                "route": "/api/v1/company/people",
                "method": "GET",
                "name": "Get Company People",
                "description": "Fetch employees/people associated with a company",
                "payload": {
                    "username": "LinkedIn company username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_company_jobs": {
                "route": "/api/v1/company/jobs",
                "method": "GET",
                "name": "Get Company Jobs",
                "description": "Retrieve job listings from a LinkedIn company",
                "payload": {
                    "username": "LinkedIn company username (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            
            # Job Endpoints
            "search_jobs": {
                "route": "/api/v1/job/search",
                "method": "GET",
                "name": "Search Jobs",
                "description": "Search for LinkedIn job listings with filters",
                "payload": {
                    "keyword": "Job search keyword for titles or descriptions (required)",
                    "page": "Page number for pagination (optional, default: 1)",
                    "sort_by": "Sort by: recent or relevant (optional, default: recent)",
                    "date_posted": "Filter by posting date: anytime, past_month, past_week, past_24_hours (optional)"
                }
            },
            "get_job_detail": {
                "route": "/api/v1/job/detail",
                "method": "GET",
                "name": "Get Job Detail",
                "description": "Retrieve detailed information about a specific job",
                "payload": {
                    "job_id": "LinkedIn job ID (required)"
                }
            },
            
            # Post Endpoints
            "get_post_detail": {
                "route": "/api/v1/post/detail",
                "method": "GET",
                "name": "Get Post Detail",
                "description": "Retrieve detailed information about a specific post",
                "payload": {
                    "post_id": "LinkedIn post ID or URN (required)"
                }
            },
            "get_post_comments": {
                "route": "/api/v1/post/comments",
                "method": "GET",
                "name": "Get Post Comments",
                "description": "Fetch comments on a LinkedIn post",
                "payload": {
                    "post_id": "LinkedIn post ID or URN (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_post_reactions": {
                "route": "/api/v1/post/reactions",
                "method": "GET",
                "name": "Get Post Reactions",
                "description": "Retrieve reactions on a LinkedIn post",
                "payload": {
                    "post_id": "LinkedIn post ID or URN (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            },
            "get_post_reposts": {
                "route": "/api/v1/post/reposts",
                "method": "GET",
                "name": "Get Post Reposts",
                "description": "Fetch reposts of a LinkedIn post",
                "payload": {
                    "post_id": "LinkedIn post ID or URN (required)",
                    "page": "Page number for pagination (optional, default: 1)"
                }
            }
        }
        base_url = "https://fresh-linkedin-scraper-api.p.rapidapi.com"
        super().__init__(base_url, endpoints)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    tool = LinkedinProvider()

    # Example: Get user profile
    profile_result = tool.call_endpoint(
        route="get_user_profile",
        payload={"username": "williamhgates"}
    )
    print("User Profile:", profile_result)
    
    # Example: Get user skills
    skills_result = tool.call_endpoint(
        route="get_user_skills",
        payload={"username": "williamhgates", "page": 1}
    )
    print("User Skills:", skills_result)
    
    # Example: Search people by job title
    search_result = tool.call_endpoint(
        route="search_people",
        payload={"keyword": "software engineer", "location": "San Francisco", "page": 1}
    )
    print("Search People by Job:", search_result)
    
    # Example: Search people by name
    search_by_name = tool.call_endpoint(
        route="search_people",
        payload={"name": "Bill Gates", "page": 1}
    )
    print("Search People by Name:", search_by_name)
    
    # Example: Get company profile
    company_result = tool.call_endpoint(
        route="get_company_profile",
        payload={"username": "microsoft"}
    )
    print("Company Profile:", company_result)
    
    # Example: Search jobs
    jobs_result = tool.call_endpoint(
        route="search_jobs",
        payload={
            "keyword": "python developer",
            "page": 1,
            "sort_by": "recent",
            "date_posted": "past_week"
        }
    )
    print("Jobs:", jobs_result)
