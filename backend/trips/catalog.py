"""Indian destination presets and day-plan templates.

Used by the create-trip wizard (smart defaults) and by "Generate day plan", which
gives the traveller an editable starting point instead of a blank itinerary.
"""

from datetime import time

# --- Destinations -----------------------------------------------------------
# cover_key drives the illustrated cover art on the frontend.

DESTINATIONS = [
    {"name": "Goa", "region": "Goa", "cover_key": "beach", "tagline": "Beaches, shacks and sunsets", "ideal_days": 4, "transport": "flight"},
    {"name": "Manali", "region": "Himachal Pradesh", "cover_key": "snow", "tagline": "Snow, cafes and the Beas river", "ideal_days": 5, "transport": "bus"},
    {"name": "Leh Ladakh", "region": "Ladakh", "cover_key": "road", "tagline": "The road trip every Indian dreams of", "ideal_days": 8, "transport": "bike"},
    {"name": "Spiti Valley", "region": "Himachal Pradesh", "cover_key": "road", "tagline": "Cold desert villages and monasteries", "ideal_days": 8, "transport": "car"},
    {"name": "Jaipur", "region": "Rajasthan", "cover_key": "fort", "tagline": "Pink city forts and bazaars", "ideal_days": 3, "transport": "train"},
    {"name": "Udaipur", "region": "Rajasthan", "cover_key": "palace", "tagline": "Lakes, palaces and slow evenings", "ideal_days": 3, "transport": "train"},
    {"name": "Jaisalmer", "region": "Rajasthan", "cover_key": "desert", "tagline": "Golden fort and desert camps", "ideal_days": 3, "transport": "train"},
    {"name": "Alleppey", "region": "Kerala", "cover_key": "backwater", "tagline": "Houseboats on the backwaters", "ideal_days": 3, "transport": "train"},
    {"name": "Munnar", "region": "Kerala", "cover_key": "tea", "tagline": "Tea estates and cool mornings", "ideal_days": 3, "transport": "car"},
    {"name": "Rishikesh", "region": "Uttarakhand", "cover_key": "river", "tagline": "Ganga aarti and river rafting", "ideal_days": 3, "transport": "bus"},
    {"name": "Varanasi", "region": "Uttar Pradesh", "cover_key": "temple", "tagline": "Ghats, aarti and old lanes", "ideal_days": 3, "transport": "train"},
    {"name": "Shillong", "region": "Meghalaya", "cover_key": "forest", "tagline": "Waterfalls and living root bridges", "ideal_days": 5, "transport": "car"},
    {"name": "Srinagar", "region": "Jammu & Kashmir", "cover_key": "valley", "tagline": "Dal lake shikaras and gardens", "ideal_days": 5, "transport": "flight"},
    {"name": "Coorg", "region": "Karnataka", "cover_key": "forest", "tagline": "Coffee estates and misty hills", "ideal_days": 3, "transport": "car"},
    {"name": "Hampi", "region": "Karnataka", "cover_key": "fort", "tagline": "Boulders, ruins and sunsets", "ideal_days": 3, "transport": "train"},
    {"name": "Gokarna", "region": "Karnataka", "cover_key": "beach", "tagline": "Quiet beaches and temple town", "ideal_days": 3, "transport": "train"},
    {"name": "Pondicherry", "region": "Puducherry", "cover_key": "beach", "tagline": "French quarter and sea breeze", "ideal_days": 3, "transport": "train"},
    {"name": "Darjeeling", "region": "West Bengal", "cover_key": "tea", "tagline": "Toy train and Kanchenjunga sunrise", "ideal_days": 4, "transport": "train"},
    {"name": "Andaman Islands", "region": "Andaman & Nicobar", "cover_key": "beach", "tagline": "Turquoise water and corals", "ideal_days": 6, "transport": "flight"},
    {"name": "Mumbai", "region": "Maharashtra", "cover_key": "city", "tagline": "Sea link, vada pav and Marine Drive", "ideal_days": 3, "transport": "train"},
    {"name": "Lonavala", "region": "Maharashtra", "cover_key": "valley", "tagline": "Monsoon hills close to the city", "ideal_days": 2, "transport": "car"},
    {"name": "Kasol", "region": "Himachal Pradesh", "cover_key": "valley", "tagline": "Parvati valley and riverside cafes", "ideal_days": 4, "transport": "bus"},
    {"name": "Rann of Kutch", "region": "Gujarat", "cover_key": "desert", "tagline": "White desert and handicraft villages", "ideal_days": 3, "transport": "car"},
    {"name": "Tirupati", "region": "Andhra Pradesh", "cover_key": "temple", "tagline": "Darshan and hill temples", "ideal_days": 2, "transport": "train"},
]

COVER_KEYS = ["beach", "mountain", "snow", "fort", "palace", "desert", "backwater", "tea", "river", "temple", "forest", "valley", "city", "road"]


# --- Trip type defaults -----------------------------------------------------

TRIP_TYPE_DEFAULTS = {
    "weekend": {"days": 2, "pace": "packed", "transport": "car", "hint": "Short and sweet — 2 days works best."},
    "road": {"days": 5, "pace": "balanced", "transport": "car", "hint": "Car or bike? We'll plan driving time between stops."},
    "family": {"days": 4, "pace": "relaxed", "transport": "train", "hint": "Relaxed pace with breaks — easier with parents and kids."},
    "friends": {"days": 4, "pace": "balanced", "transport": "mixed", "hint": "A good mix of sightseeing and chill time."},
    "couple": {"days": 3, "pace": "relaxed", "transport": "flight", "hint": "Fewer stops, longer evenings."},
    "solo": {"days": 5, "pace": "balanced", "transport": "train", "hint": "Flexible plan you can change on the go."},
    "college": {"days": 3, "pace": "packed", "transport": "bus", "hint": "Budget friendly and packed with activities."},
    "office": {"days": 2, "pace": "balanced", "transport": "bus", "hint": "Group friendly timings and shared activities."},
    "pilgrimage": {"days": 3, "pace": "relaxed", "transport": "train", "hint": "Early mornings and darshan timings kept in mind."},
    "adventure": {"days": 5, "pace": "packed", "transport": "mixed", "hint": "Treks and activities with recovery time."},
}

PACE_ACTIVITY_COUNT = {"relaxed": 4, "balanced": 5, "packed": 7}


# --- Day plan templates -----------------------------------------------------
# Each stop: (start_time, title, category, place_name, cost, xp, description)

def _stop(hour, minute, title, category, place, cost, xp, description=""):
    return {
        "start_time": time(hour, minute),
        "title": title,
        "category": category,
        "place_name": place,
        "cost": cost,
        "xp_value": xp,
        "description": description,
    }


DESTINATION_PLANS = {
    "goa": [
        [
            _stop(9, 0, "Breakfast at a beach shack", "food", "Baga Beach", 300, 20, "Poha, omelette and filter coffee by the sea."),
            _stop(11, 0, "Fort Aguada", "sightseeing", "Fort Aguada, Candolim", 50, 40, "Portuguese fort with a lighthouse and sea views."),
            _stop(13, 30, "Goan thali lunch", "food", "Calangute", 400, 20, "Fish curry rice — the real Goan lunch."),
            _stop(16, 30, "Baga Beach", "nature", "Baga Beach", 0, 40, "Water sports, or just sit and watch the waves."),
            _stop(18, 30, "Sunset point", "nature", "Sinquerim", 0, 30, "Best 20 minutes of the day."),
            _stop(20, 30, "Dinner at Tito's Lane", "food", "Tito's Lane, Baga", 800, 25, ""),
            _stop(22, 0, "Night market", "shopping", "Arpora Saturday Night Market", 500, 20, ""),
        ],
        [
            _stop(8, 30, "Drive to South Goa", "travel", "Panaji to Palolem", 600, 30, "Scenic coastal drive, about 2 hours."),
            _stop(11, 0, "Palolem Beach", "nature", "Palolem Beach", 0, 40, "Calmer, cleaner and far less crowded."),
            _stop(13, 30, "Lunch by the water", "food", "Palolem", 500, 20, ""),
            _stop(16, 0, "Butterfly Beach boat ride", "adventure", "Butterfly Beach", 800, 50, "Dolphins if you're lucky."),
            _stop(18, 30, "Cabo de Rama Fort", "sightseeing", "Cabo de Rama", 0, 40, "Quiet cliffside fort with a big view."),
            _stop(20, 30, "Seafood dinner", "food", "Agonda", 900, 25, ""),
        ],
        [
            _stop(9, 0, "Old Goa churches", "sightseeing", "Basilica of Bom Jesus", 0, 40, "UNESCO listed, worth the slow walk."),
            _stop(11, 30, "Panjim Latin Quarter", "sightseeing", "Fontainhas, Panaji", 0, 40, "Colourful Portuguese houses and small art galleries."),
            _stop(13, 30, "Lunch at a Goan cafe", "food", "Panaji", 450, 20, ""),
            _stop(16, 0, "Spice plantation tour", "nature", "Ponda", 700, 40, ""),
            _stop(19, 0, "Mandovi river cruise", "event", "Panaji Jetty", 400, 40, "Live music and the river at night."),
        ],
    ],
    "manali": [
        [
            _stop(8, 30, "Breakfast at Old Manali", "food", "Old Manali", 300, 20, ""),
            _stop(10, 30, "Hadimba Temple", "sightseeing", "Hadimba Devi Temple", 0, 40, "Cedar forest temple, very peaceful early."),
            _stop(13, 0, "Lunch at Mall Road", "food", "Mall Road", 400, 20, ""),
            _stop(15, 0, "Vashisht hot springs", "rest", "Vashisht", 0, 30, ""),
            _stop(17, 30, "Cafe hopping", "food", "Old Manali", 350, 25, ""),
            _stop(20, 0, "Dinner and bonfire", "food", "Old Manali", 600, 25, ""),
        ],
        [
            _stop(6, 30, "Early start for Solang", "travel", "Manali to Solang Valley", 500, 30, "Leave early — the road gets busy."),
            _stop(9, 0, "Solang Valley activities", "adventure", "Solang Valley", 1500, 60, "Paragliding, zorbing or the ropeway."),
            _stop(13, 0, "Lunch at Solang", "food", "Solang Valley", 400, 20, ""),
            _stop(15, 0, "Atal Tunnel drive", "travel", "Atal Tunnel", 0, 50, "9 km through the mountain."),
            _stop(17, 0, "Sissu waterfall", "nature", "Sissu, Lahaul", 0, 40, ""),
            _stop(20, 0, "Dinner back in Manali", "food", "Manali", 500, 20, ""),
        ],
    ],
    "leh ladakh": [
        [
            _stop(9, 0, "Rest and acclimatise", "rest", "Leh", 0, 30, "Take day one slow — altitude is real."),
            _stop(12, 0, "Leh Market walk", "shopping", "Leh Main Bazaar", 500, 30, ""),
            _stop(16, 0, "Shanti Stupa", "sightseeing", "Shanti Stupa", 0, 40, "Sunset over the whole valley."),
            _stop(19, 0, "Ladakhi dinner", "food", "Leh", 500, 25, "Thukpa and momos."),
        ],
        [
            _stop(6, 0, "Drive to Pangong Lake", "travel", "Leh to Pangong", 2500, 60, "5 hours over Chang La pass."),
            _stop(12, 0, "Chang La pass", "sightseeing", "Chang La", 0, 50, "17,590 ft — don't stay too long."),
            _stop(15, 0, "Pangong Lake", "nature", "Pangong Tso", 0, 80, "The colour changes through the day."),
            _stop(18, 30, "Camp stay and stars", "stay", "Pangong", 3000, 50, ""),
        ],
        [
            _stop(7, 0, "Nubra valley via Khardung La", "travel", "Khardung La", 2000, 70, ""),
            _stop(12, 0, "Diskit Monastery", "sightseeing", "Diskit", 50, 40, ""),
            _stop(15, 0, "Hunder sand dunes", "adventure", "Hunder", 1200, 60, "Double-humped camel ride."),
            _stop(19, 0, "Desert camp dinner", "food", "Hunder", 700, 25, ""),
        ],
    ],
    "jaipur": [
        [
            _stop(8, 0, "Breakfast — kachori and chai", "food", "Rawat Mishthan Bhandar", 150, 20, ""),
            _stop(9, 30, "Amer Fort", "sightseeing", "Amer Fort", 200, 50, "Go early to avoid the heat and the queue."),
            _stop(12, 30, "Panna Meena ka Kund", "sightseeing", "Panna Meena ka Kund", 0, 30, "The stepwell everyone photographs."),
            _stop(14, 0, "Rajasthani thali", "food", "Chokhi Dhani or a city thali", 500, 25, ""),
            _stop(16, 30, "Hawa Mahal", "sightseeing", "Hawa Mahal", 50, 40, ""),
            _stop(18, 0, "Bapu Bazaar shopping", "shopping", "Bapu Bazaar", 1000, 30, "Juttis, bandhani and blue pottery."),
            _stop(20, 0, "Dinner at Nahargarh", "food", "Nahargarh Fort", 800, 30, "City lights from above."),
        ],
        [
            _stop(9, 0, "City Palace", "sightseeing", "City Palace, Jaipur", 300, 50, ""),
            _stop(11, 30, "Jantar Mantar", "sightseeing", "Jantar Mantar", 200, 40, ""),
            _stop(13, 30, "Lunch", "food", "MI Road", 400, 20, ""),
            _stop(16, 0, "Jal Mahal photo stop", "sightseeing", "Jal Mahal", 0, 30, ""),
            _stop(18, 0, "Albert Hall Museum", "sightseeing", "Albert Hall", 150, 40, ""),
        ],
    ],
    "alleppey": [
        [
            _stop(9, 0, "Kerala breakfast", "food", "Alleppey town", 200, 20, "Puttu, kadala curry and banana."),
            _stop(11, 0, "Board the houseboat", "stay", "Alleppey Finishing Point", 6000, 60, ""),
            _stop(13, 0, "Lunch on the boat", "food", "Backwaters", 0, 25, "Karimeen fry, served on a banana leaf."),
            _stop(16, 0, "Village canal walk", "nature", "Kumarakom canals", 0, 40, ""),
            _stop(18, 30, "Sunset on the deck", "nature", "Vembanad Lake", 0, 40, ""),
        ],
        [
            _stop(8, 0, "Sunrise on the backwaters", "nature", "Vembanad Lake", 0, 40, ""),
            _stop(10, 30, "Alleppey beach and pier", "nature", "Alappuzha Beach", 0, 30, ""),
            _stop(13, 0, "Lunch — Kerala sadya", "food", "Alleppey", 350, 25, ""),
            _stop(16, 0, "Marari Beach", "nature", "Marari Beach", 0, 40, ""),
        ],
    ],
    "rishikesh": [
        [
            _stop(7, 0, "Morning yoga by the Ganga", "rest", "Parmarth Niketan", 200, 40, ""),
            _stop(9, 30, "Breakfast at a German bakery", "food", "Laxman Jhula", 300, 20, ""),
            _stop(11, 30, "River rafting", "adventure", "Shivpuri to Rishikesh", 1200, 70, "16 km stretch — the popular one."),
            _stop(15, 0, "Lunch", "food", "Tapovan", 350, 20, ""),
            _stop(17, 0, "Beatles Ashram", "sightseeing", "Chaurasi Kutia", 150, 40, ""),
            _stop(18, 30, "Ganga aarti", "event", "Triveni Ghat", 0, 50, "Reach 20 minutes early for a good spot."),
        ],
    ],
    "udaipur": [
        [
            _stop(8, 30, "Breakfast with a lake view", "food", "Lal Ghat", 350, 20, ""),
            _stop(10, 0, "City Palace", "sightseeing", "City Palace, Udaipur", 300, 50, ""),
            _stop(13, 0, "Lunch", "food", "Gangaur Ghat", 450, 20, ""),
            _stop(16, 0, "Saheliyon ki Bari", "nature", "Saheliyon ki Bari", 100, 30, ""),
            _stop(17, 30, "Lake Pichola boat ride", "nature", "Lake Pichola", 400, 50, "Go for the sunset slot."),
            _stop(20, 0, "Rooftop dinner", "food", "Old City", 700, 25, ""),
        ],
    ],
    "coorg": [
        [
            _stop(8, 30, "Coffee estate breakfast", "food", "Madikeri", 300, 20, ""),
            _stop(10, 30, "Abbey Falls", "nature", "Abbey Falls", 50, 40, ""),
            _stop(13, 0, "Coorgi lunch", "food", "Madikeri", 400, 25, "Pandi curry and akki roti."),
            _stop(15, 30, "Coffee plantation walk", "nature", "Coorg plantation", 500, 40, ""),
            _stop(18, 0, "Raja's Seat sunset", "nature", "Raja's Seat", 30, 40, ""),
        ],
    ],
}


GENERIC_PLANS = {
    "beach": [
        _stop(8, 30, "Breakfast near the beach", "food", "", 300, 20, ""),
        _stop(10, 30, "Beach morning", "nature", "", 0, 40, ""),
        _stop(13, 0, "Local seafood lunch", "food", "", 500, 20, ""),
        _stop(16, 0, "Water sports", "adventure", "", 1000, 50, ""),
        _stop(18, 30, "Sunset point", "nature", "", 0, 40, ""),
        _stop(20, 30, "Dinner by the sea", "food", "", 700, 25, ""),
        _stop(22, 0, "Night walk", "rest", "", 0, 15, ""),
    ],
    "fort": [
        _stop(8, 0, "Local breakfast", "food", "", 200, 20, ""),
        _stop(9, 30, "Main fort visit", "sightseeing", "", 200, 50, ""),
        _stop(12, 30, "Old city walk", "sightseeing", "", 0, 30, ""),
        _stop(14, 0, "Thali lunch", "food", "", 400, 20, ""),
        _stop(16, 30, "Museum or palace", "sightseeing", "", 200, 40, ""),
        _stop(18, 30, "Bazaar shopping", "shopping", "", 800, 30, ""),
        _stop(20, 30, "Dinner", "food", "", 600, 25, ""),
    ],
    "mountain": [
        _stop(7, 30, "Sunrise point", "nature", "", 0, 50, ""),
        _stop(9, 30, "Breakfast at a cafe", "food", "", 300, 20, ""),
        _stop(11, 0, "Short trek", "adventure", "", 0, 60, ""),
        _stop(14, 0, "Lunch", "food", "", 400, 20, ""),
        _stop(16, 30, "Viewpoint drive", "travel", "", 500, 40, ""),
        _stop(19, 0, "Dinner and bonfire", "food", "", 600, 25, ""),
        _stop(21, 0, "Stargazing", "nature", "", 0, 30, ""),
    ],
    "city": [
        _stop(8, 30, "Street breakfast", "food", "", 150, 20, ""),
        _stop(10, 0, "Main landmark", "sightseeing", "", 100, 40, ""),
        _stop(12, 30, "Local market", "shopping", "", 600, 30, ""),
        _stop(14, 0, "Lunch", "food", "", 400, 20, ""),
        _stop(16, 30, "Museum or gallery", "sightseeing", "", 150, 40, ""),
        _stop(18, 30, "Sunset spot", "nature", "", 0, 30, ""),
        _stop(20, 30, "Dinner", "food", "", 700, 25, ""),
    ],
    "temple": [
        _stop(6, 0, "Morning darshan", "event", "", 0, 50, ""),
        _stop(8, 30, "Breakfast", "food", "", 150, 20, ""),
        _stop(10, 30, "Ghat or temple walk", "sightseeing", "", 0, 40, ""),
        _stop(13, 0, "Prasad lunch", "food", "", 200, 20, ""),
        _stop(16, 30, "Second temple visit", "sightseeing", "", 0, 40, ""),
        _stop(18, 30, "Evening aarti", "event", "", 0, 50, ""),
    ],
}

# cover_key -> which generic plan to fall back to
GENERIC_BY_COVER = {
    "beach": "beach",
    "fort": "fort",
    "palace": "fort",
    "desert": "fort",
    "mountain": "mountain",
    "snow": "mountain",
    "valley": "mountain",
    "road": "mountain",
    "tea": "mountain",
    "forest": "mountain",
    "river": "mountain",
    "backwater": "beach",
    "city": "city",
    "temple": "temple",
}


# Approximate coordinates for the places used in the plans above, so the map
# tab and the "Navigate" buttons have something real to point at.
COORDS = {
    # Goa
    "Baga Beach": (15.5553, 73.7517),
    "Fort Aguada, Candolim": (15.4925, 73.7735),
    "Calangute": (15.5439, 73.7553),
    "Sinquerim": (15.4997, 73.7669),
    "Tito's Lane, Baga": (15.5560, 73.7530),
    "Arpora Saturday Night Market": (15.5661, 73.7666),
    "Panaji to Palolem": (15.4909, 73.8278),
    "Palolem Beach": (15.0100, 74.0233),
    "Palolem": (15.0100, 74.0233),
    "Butterfly Beach": (15.0186, 74.0325),
    "Cabo de Rama": (15.0888, 73.9200),
    "Agonda": (15.0437, 73.9866),
    "Basilica of Bom Jesus": (15.5009, 73.9116),
    "Fontainhas, Panaji": (15.4967, 73.8296),
    "Panaji": (15.4909, 73.8278),
    "Ponda": (15.4027, 74.0078),
    "Panaji Jetty": (15.4988, 73.8271),
    # Manali
    "Old Manali": (32.2540, 77.1800),
    "Hadimba Devi Temple": (32.2494, 77.1745),
    "Mall Road": (32.2432, 77.1892),
    "Vashisht": (32.2664, 77.1874),
    "Manali": (32.2396, 77.1887),
    "Manali to Solang Valley": (32.3190, 77.1560),
    "Solang Valley": (32.3190, 77.1560),
    "Atal Tunnel": (32.4000, 77.1700),
    "Sissu, Lahaul": (32.4820, 77.1250),
    # Ladakh
    "Leh": (34.1526, 77.5771),
    "Leh Main Bazaar": (34.1650, 77.5847),
    "Shanti Stupa": (34.1580, 77.5680),
    "Leh to Pangong": (34.1526, 77.5771),
    "Chang La": (34.0333, 77.9333),
    "Pangong Tso": (33.7500, 78.6000),
    "Pangong": (33.7500, 78.6000),
    "Khardung La": (34.2786, 77.6047),
    "Diskit": (34.5400, 77.5600),
    "Hunder": (34.5750, 77.4950),
    # Jaipur
    "Rawat Mishthan Bhandar": (26.9198, 75.7990),
    "Amer Fort": (26.9855, 75.8513),
    "Panna Meena ka Kund": (26.9900, 75.8500),
    "Chokhi Dhani or a city thali": (26.7590, 75.8130),
    "Hawa Mahal": (26.9239, 75.8267),
    "Bapu Bazaar": (26.9155, 75.8200),
    "Nahargarh Fort": (26.9374, 75.8153),
    "City Palace, Jaipur": (26.9258, 75.8237),
    "Jantar Mantar": (26.9247, 75.8246),
    "MI Road": (26.9146, 75.8080),
    "Jal Mahal": (26.9535, 75.8463),
    "Albert Hall": (26.9117, 75.8194),
    # Kerala
    "Alleppey town": (9.4981, 76.3388),
    "Alleppey": (9.4981, 76.3388),
    "Alleppey Finishing Point": (9.4790, 76.3280),
    "Backwaters": (9.4700, 76.3600),
    "Kumarakom canals": (9.6177, 76.4274),
    "Vembanad Lake": (9.5500, 76.4000),
    "Alappuzha Beach": (9.4906, 76.3170),
    "Marari Beach": (9.6000, 76.2960),
    # Rishikesh
    "Parmarth Niketan": (30.1270, 78.3200),
    "Laxman Jhula": (30.1280, 78.3290),
    "Shivpuri to Rishikesh": (30.1300, 78.3800),
    "Tapovan": (30.1290, 78.3200),
    "Chaurasi Kutia": (30.1150, 78.3230),
    "Triveni Ghat": (30.1080, 78.2940),
    # Udaipur
    "Lal Ghat": (24.5790, 73.6830),
    "City Palace, Udaipur": (24.5760, 73.6835),
    "Gangaur Ghat": (24.5800, 73.6820),
    "Saheliyon ki Bari": (24.6000, 73.6890),
    "Lake Pichola": (24.5720, 73.6790),
    "Old City": (24.5790, 73.6840),
    # Coorg
    "Madikeri": (12.4200, 75.7400),
    "Abbey Falls": (12.4530, 75.7160),
    "Coorg plantation": (12.4000, 75.7300),
    "Raja's Seat": (12.4194, 75.7300),
}


def find_destination(name: str) -> dict | None:
    needle = (name or "").strip().lower()
    if not needle:
        return None
    for dest in DESTINATIONS:
        if dest["name"].lower() == needle:
            return dest
    for dest in DESTINATIONS:
        if dest["name"].lower() in needle or needle in dest["name"].lower():
            return dest
    return None


def plan_for_day(destination: str, cover_key: str, day_index: int, pace: str = "balanced") -> list[dict]:
    """Return a list of activity dicts for one day. Never returns an empty list."""
    key = (destination or "").strip().lower()
    plans = None
    for name, days in DESTINATION_PLANS.items():
        if name == key or name in key or key in name:
            plans = days
            break

    if plans:
        stops = plans[(day_index - 1) % len(plans)]
    else:
        generic_key = GENERIC_BY_COVER.get(cover_key, "city")
        stops = GENERIC_PLANS[generic_key]

    limit = PACE_ACTIVITY_COUNT.get(pace, 5)
    plan = []
    for stop in stops[:limit]:
        entry = dict(stop)
        coords = COORDS.get(entry["place_name"])
        if coords:
            entry["latitude"], entry["longitude"] = coords
        plan.append(entry)
    return plan
