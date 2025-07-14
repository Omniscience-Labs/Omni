import time
import random
import string
from ..protocols import ExternalUserIdGeneratorService
from ..domain.value_objects import ExternalUserId, AppSlug, ProfileName


class ExternalUserIdService:
    def generate(self, account_id: str, app_slug: AppSlug, profile_name: ProfileName) -> ExternalUserId:
        timestamp = int(time.time() * 1000)
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
        
        safe_profile_name = profile_name.value.lower().replace(' ', '_')
        external_id = f"{account_id[:8]}_{app_slug.value}_{safe_profile_name}_{timestamp}_{random_suffix}"
        
        return ExternalUserId(external_id) 