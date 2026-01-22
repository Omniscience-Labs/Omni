from typing import Dict

from core.tools.data_providers.RapidDataProviderBase import RapidDataProviderBase, EndpointSchema


class TwitterProvider(RapidDataProviderBase):
    def __init__(self):
        endpoints: Dict[str, EndpointSchema] = {
            # User Endpoints
            "get_user": {
                "route": "/user",
                "method": "GET",
                "name": "Get User By Username",
                "description": "Get detailed information about a Twitter/X user by username",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)"
                }
            },
            "get_users_by_ids": {
                "route": "/users-by-ids",
                "method": "GET",
                "name": "Get Users By IDs",
                "description": "Get multiple user profiles by their user IDs",
                "payload": {
                    "ids": "Comma-separated list of user IDs (required)"
                }
            },
            "get_user_tweets": {
                "route": "/user-tweets",
                "method": "GET",
                "name": "Get User Tweets",
                "description": "Get tweets posted by a specific user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_replies": {
                "route": "/user-replies",
                "method": "GET",
                "name": "Get User Replies",
                "description": "Get replies made by a specific user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_media": {
                "route": "/user-media",
                "method": "GET",
                "name": "Get User Media",
                "description": "Get media (photos/videos) posted by a user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_followers": {
                "route": "/user-followers",
                "method": "GET",
                "name": "Get User Followers",
                "description": "Get list of users following a specific user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_verified_followers": {
                "route": "/user-verified-followers",
                "method": "GET",
                "name": "Get User Verified Followers",
                "description": "Get list of verified users following a specific user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_followers_ids": {
                "route": "/user-followers-ids",
                "method": "GET",
                "name": "Get User Followers IDs",
                "description": "Get IDs of users following a specific user",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_following": {
                "route": "/user-following",
                "method": "GET",
                "name": "Get User Following",
                "description": "Get list of users that a specific user follows",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_following_ids": {
                "route": "/user-following-ids",
                "method": "GET",
                "name": "Get User Following IDs",
                "description": "Get IDs of users that a specific user follows",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_user_highlights": {
                "route": "/user-highlights",
                "method": "GET",
                "name": "Get User Highlights",
                "description": "Get highlighted tweets from a user's profile",
                "payload": {
                    "username": "Twitter username without the @ symbol (required)"
                }
            },
            
            # Search & Explore Endpoints
            "search": {
                "route": "/search",
                "method": "GET",
                "name": "Search Tweets",
                "description": "Search for tweets matching a query",
                "payload": {
                    "query": "Search query string (required)",
                    "type": "Search type: Latest, Top, People, Photos, Videos (optional, default: Latest)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "search_top": {
                "route": "/search/top",
                "method": "GET",
                "name": "Search Top Tweets",
                "description": "Search for top/popular tweets matching a query",
                "payload": {
                    "query": "Search query string (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "search_latest": {
                "route": "/search/latest",
                "method": "GET",
                "name": "Search Latest Tweets",
                "description": "Search for latest tweets matching a query",
                "payload": {
                    "query": "Search query string (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            
            # Tweet/Post Endpoints
            "get_tweet": {
                "route": "/tweet",
                "method": "GET",
                "name": "Get Tweet By ID",
                "description": "Get detailed information about a specific tweet",
                "payload": {
                    "id": "Tweet ID (required)"
                }
            },
            "get_tweet_replies": {
                "route": "/tweet-replies",
                "method": "GET",
                "name": "Get Tweet Replies",
                "description": "Get replies to a specific tweet",
                "payload": {
                    "id": "Tweet ID (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_tweet_retweets": {
                "route": "/tweet-retweets",
                "method": "GET",
                "name": "Get Tweet Retweets",
                "description": "Get users who retweeted a specific tweet",
                "payload": {
                    "id": "Tweet ID (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            "get_tweet_likes": {
                "route": "/tweet-likes",
                "method": "GET",
                "name": "Get Tweet Likes",
                "description": "Get users who liked a specific tweet",
                "payload": {
                    "id": "Tweet ID (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            },
            
            # Trends Endpoint
            "get_trends": {
                "route": "/trends",
                "method": "GET",
                "name": "Get Trending Topics",
                "description": "Get current trending topics on Twitter/X",
                "payload": {
                    "woeid": "Where On Earth ID for location (optional, default: 1 for worldwide)"
                }
            },
            
            # Lists Endpoints
            "get_list": {
                "route": "/list",
                "method": "GET",
                "name": "Get List Details",
                "description": "Get details about a Twitter list",
                "payload": {
                    "id": "List ID (required)"
                }
            },
            "get_list_tweets": {
                "route": "/list-tweets",
                "method": "GET",
                "name": "Get List Tweets",
                "description": "Get tweets from a Twitter list",
                "payload": {
                    "id": "List ID (required)",
                    "cursor": "Pagination cursor for next page (optional)"
                }
            }
        }
        base_url = "https://twitter241.p.rapidapi.com"
        super().__init__(base_url, endpoints)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    tool = TwitterProvider()

    # Example: Get user profile
    user_info = tool.call_endpoint(
        route="get_user",
        payload={
            "username": "elonmusk"
        }
    )
    print("User Info:", user_info)
    
    # Example: Get user tweets
    user_tweets = tool.call_endpoint(
        route="get_user_tweets",
        payload={
            "username": "elonmusk"
        }
    )
    print("User Tweets:", user_tweets)
    
    # Example: Get user followers
    followers = tool.call_endpoint(
        route="get_user_followers",
        payload={
            "username": "elonmusk"
        }
    )
    print("Followers:", followers)
    
    # Example: Get user following
    following = tool.call_endpoint(
        route="get_user_following",
        payload={
            "username": "elonmusk"
        }
    )
    print("Following:", following)
    
    # Example: Search latest tweets
    search_results = tool.call_endpoint(
        route="search_latest",
        payload={
            "query": "artificial intelligence"
        }
    )
    print("Search Results:", search_results)
    
    # Example: Get tweet details
    tweet = tool.call_endpoint(
        route="get_tweet",
        payload={
            "id": "1234567890123456789"
        }
    )
    print("Tweet:", tweet)
    
    # Example: Get tweet replies
    replies = tool.call_endpoint(
        route="get_tweet_replies",
        payload={
            "id": "1234567890123456789"
        }
    )
    print("Tweet Replies:", replies)
    
    # Example: Get trending topics
    trends = tool.call_endpoint(
        route="get_trends",
        payload={
            "woeid": "1"  # 1 = Worldwide
        }
    )
    print("Trends:", trends)
    
    # Example: Get user media
    media = tool.call_endpoint(
        route="get_user_media",
        payload={
            "username": "elonmusk"
        }
    )
    print("User Media:", media)
  