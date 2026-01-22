from typing import Dict
import logging

from core.tools.data_providers.RapidDataProviderBase import RapidDataProviderBase, EndpointSchema

logger = logging.getLogger(__name__)


class ZillowProvider(RapidDataProviderBase):
    def __init__(self):
        endpoints: Dict[str, EndpointSchema] = {
            "search": {
                "route": "/v3/for-sale",
                "method": "GET",
                "name": "Property Search",
                "description": "Search for properties for sale by location (city, state, ZIP code) with various filters.",
                "payload": {
                    "location": "Location can be a city, state, or ZIP code (e.g., 'Houston, TX' or '77001') (required)",
                    "offset": "Offset for pagination (optional, default: 0)",
                    "limit": "Number of results per page (optional, default: 42, max: 200)",
                    "sort": "Sort order: newest, price_high, price_low, beds, baths, sqft, lot_sqft (optional)",
                    "price_min": "Minimum price (optional)",
                    "price_max": "Maximum price (optional)",
                    "sqft_min": "Minimum square footage (optional)",
                    "sqft_max": "Maximum square footage (optional)",
                    "beds_min": "Minimum number of bedrooms (optional)",
                    "beds_max": "Maximum number of bedrooms (optional)",
                    "baths_min": "Minimum number of bathrooms (optional)",
                    "baths_max": "Maximum number of bathrooms (optional)",
                    "year_built_min": "Minimum year built (optional)",
                    "year_built_max": "Maximum year built (optional)",
                    "lot_sqft_min": "Minimum lot size in sqft (optional)",
                    "lot_sqft_max": "Maximum lot size in sqft (optional)",
                    "property_type": "Property type filter (optional)",
                    "status": "Property status: for_sale, for_rent, recently_sold (optional, default: for_sale)"
                }
            },
            "search_address": {
                "route": "/v3/property-detail",
                "method": "GET",
                "name": "Property Search by Address",
                "description": "Search for a specific property by its full address.",
                "payload": {
                    "address": "Full property address (required)"
                }
            },
            "propertyV2": {
                "route": "/v3/property-detail",
                "method": "GET",
                "name": "Property Details",
                "description": "Get detailed information about a specific property by property_id, address, or MLS ID.",
                "payload": {
                    "property_id": "Property ID (optional if address or mls_id is provided)",
                    "address": "Property address (optional if property_id or mls_id is provided)",
                    "mls_id": "MLS ID (optional if property_id or address is provided)"
                }
            },
            "search_rent": {
                "route": "/v2/for-rent",
                "method": "GET",
                "name": "Rental Property Search",
                "description": "Search for rental properties by location with various filters.",
                "payload": {
                    "location": "Location can be a city, state, or ZIP code (e.g., 'Houston, TX' or '77001') (required)",
                    "offset": "Offset for pagination (optional, default: 0)",
                    "limit": "Number of results per page (optional, default: 42)",
                    "price_min": "Minimum rent price (optional)",
                    "price_max": "Maximum rent price (optional)",
                    "beds_min": "Minimum number of bedrooms (optional)",
                    "baths_min": "Minimum number of bathrooms (optional)",
                    "sqft_min": "Minimum square footage (optional)",
                    "property_type": "Property type filter (optional)"
                }
            },
            "sold_homes": {
                "route": "/sold-homes",
                "method": "GET",
                "name": "Sold Homes Search",
                "description": "Search for recently sold properties by location.",
                "payload": {
                    "location": "Location can be a city, state, or ZIP code (e.g., 'Houston, TX' or '77001') (required)",
                    "offset": "Offset for pagination (optional, default: 0)",
                    "limit": "Number of results per page (optional, default: 42)"
                }
            },
            "mortgage_rates": {
                "route": "/finance/average-rate",
                "method": "GET",
                "name": "Mortgage Rates",
                "description": "Get current average mortgage rates.",
                "payload": {
                    "loan_term": "Loan term in years (e.g., 30, 15, etc.) (optional)",
                    "loan_type": "Loan type: conventional, fha, va, etc. (optional)"
                }
            },
            "mortgage_calculate": {
                "route": "/finance/mortgage-calculate",
                "method": "GET",
                "name": "Mortgage Calculator",
                "description": "Calculate mortgage payments based on loan amount, rate, and term.",
                "payload": {
                    "price": "Property price (required)",
                    "down_payment": "Down payment amount (optional)",
                    "down_payment_percent": "Down payment percentage (optional)",
                    "loan_term": "Loan term in years (optional, default: 30)",
                    "interest_rate": "Interest rate as decimal (e.g., 0.065 for 6.5%) (optional)"
                }
            },
            "location_suggest": {
                "route": "/location/suggest",
                "method": "GET",
                "name": "Location Suggestions",
                "description": "Get location address suggestions for autocomplete.",
                "payload": {
                    "q": "Search query for location (required)"
                }
            },
            "nearby_properties": {
                "route": "/location/for-sale-nearby-areas",
                "method": "GET",
                "name": "Nearby Properties",
                "description": "Find properties for sale in nearby areas.",
                "payload": {
                    "location": "Location (city, state, or ZIP code) (required)",
                    "radius": "Radius in miles (optional, default: 5)"
                }
            }
        }
        base_url = "https://us-real-estate.p.rapidapi.com"
        super().__init__(base_url, endpoints)


if __name__ == "__main__":
    from dotenv import load_dotenv
    from time import sleep
    load_dotenv()
    tool = ZillowProvider()

    # Example for searching properties in Houston
    search_result = tool.call_endpoint(
        route="search",
        payload={
            "location": "Houston, TX",
            "limit": 20,
            "sort": "newest",
            "price_min": 100000,
            "price_max": 500000,
            "beds_min": 2
        }
    )
    logger.debug("Search Result: %s", search_result)
    logger.debug("***")
    logger.debug("***")
    logger.debug("***")
    sleep(1)
    # Example for searching by address
    address_result = tool.call_endpoint(
        route="search_address",
        payload={
            "address": "1161 Natchez Dr College Station Texas 77845"
        }
    )
    logger.debug("Address Search Result: %s", address_result)
    logger.debug("***")
    logger.debug("***")
    logger.debug("***")
    sleep(1)
    # Example for getting property details
    property_result = tool.call_endpoint(
        route="propertyV2",
        payload={
            "address": "1161 Natchez Dr College Station Texas 77845"
        }
    )
    logger.debug("Property Details Result: %s", property_result)
    sleep(1)
    logger.debug("***")
    logger.debug("***")
    logger.debug("***")
    # Example for searching rental properties
    rent_result = tool.call_endpoint(
        route="search_rent",
        payload={
            "location": "Houston, TX",
            "limit": 20,
            "price_max": 2000
        }
    )
    logger.debug("Rental Search Result: %s", rent_result)
    sleep(1)
    logger.debug("***")
    logger.debug("***")
    logger.debug("***")
    # Example for getting mortgage rates
    mortgage_result = tool.call_endpoint(
        route="mortgage_rates",
        payload={
            "loan_term": 30,
            "loan_type": "conventional"
        }
    )
    logger.debug("Mortgage Rates Result: %s", mortgage_result)
    sleep(1)
    logger.debug("***")
    logger.debug("***")
    logger.debug("***")
    # Example for mortgage calculation
    mortgage_calc_result = tool.call_endpoint(
        route="mortgage_calculate",
        payload={
            "price": 300000,
            "down_payment_percent": 20,
            "loan_term": 30,
            "interest_rate": 0.065
        }
    )
    logger.debug("Mortgage Calculation Result: %s", mortgage_calc_result)
  