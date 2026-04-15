# Available Playlists - Chapter 2 Season 2 (12.41)

## How to Configure

### Game Server
Edit `GameServer/server_config.json` line 6:
```json
"playlist": "playlist_defaultsolo"
```

### Backend
Edit `Config/config.json` line 57:
```json
"gameServerIP": ["YOUR_IP:7777:playlist_defaultsolo"]
```

---

## Standard Playlists

### Solo Modes
- `playlist_defaultsolo` - Solo
- `playlist_blitz_solo` - Blitz Solo (Fast storm)
- `playlist_solidgold_solo` - Solid Gold Solo (Legendary weapons only)
- `playlist_snipers_solo` - Snipers Solo
- `playlist_impact_solo` - Close Encounters Solo

### Duo Modes
- `playlist_defaultduo` - Duos
- `playlist_blitz_duos` - Blitz Duos
- `playlist_snipers_duos` - Snipers Duos
- `playlist_impact_duos` - Close Encounters Duos
- `playlist_skysupply_duos` - Sky Supply Duos

### Squad Modes
- `playlist_defaultsquad` - Squads
- `playlist_blitz_squad` - Blitz Squads
- `playlist_solidgold_squads` - Solid Gold Squads
- `playlist_highexplosives_squads` - High Explosives Squads
- `playlist_snipers` - Snipers Squads
- `playlist_skysupply_squads` - Sky Supply Squads
- `playlist_impact_squads` - Close Encounters Squads

---

## Competitive/Arena Modes

### Arena (Chapter 2 Season 2)
- `playlist_showdownalt_solo` - Arena Solo
- `playlist_showdownalt_duos` - Arena Duos
- `playlist_showdownalt_trios` - Arena Trios
- `playlist_showdowntournament_solo` - Tournament Solo

---

## Large Team Modes

### Team Rumble
- `playlist_5x20` - Team Rumble (20v20)

### 50v50
- `playlist_50v50` - 50v50

---

## Limited Time Modes (LTMs)

### Special Modes
- `playlist_playground` - Playground Mode
- `playlist_carmine` - Carmine (Storm King)
- `playlist_fortnite` - The Fortnite
- `playlist_skysupply` - Sky Supply

---

## Boss Locations (Chapter 2 Season 2)

These work with any playlist but are location-specific:

### The Agency
- **Boss**: Midas
- **Mythic Weapon**: Midas' Drum Gun
- **Location**: Center of map

### The Yacht
- **Boss**: Deadpool (Meowscles)
- **Mythic Weapon**: Peow Peow Rifle
- **Location**: North of map

### The Rig
- **Boss**: TNTina
- **Mythic Weapon**: TNTina's Boom Bow
- **Location**: Southwest ocean

### The Grotto
- **Boss**: Brutus
- **Mythic Weapon**: Brutus' Minigun
- **Location**: Northeast

### The Shark
- **Boss**: Skye
- **Mythic Weapon**: Skye's Assault Rifle & Grappler
- **Location**: Northwest island

---

## Configuration Examples

### Example 1: Solo Arena with Bosses
```json
{
  "playlist": "playlist_showdownalt_solo",
  "bosses": {
    "enableBosses": true
  }
}
```

### Example 2: Squad Mode
```json
{
  "playlist": "playlist_defaultsquad",
  "maxPlayers": 100
}
```

### Example 3: Team Rumble
```json
{
  "playlist": "playlist_5x20",
  "maxPlayers": 40
}
```

---

## Playlist ID Mapping

If you're using numeric IDs:
- `2` → Solo
- `9` → Squad
- `10` → Duos
- `11` → 50v50
- `22` → Team Rumble (5x20)
- `28` → Arena Solo
- `35` → Playground
- `50` → 50v50

---

## Custom Playlist Settings

You can customize each playlist in your game server config:

```json
{
  "playlist": "playlist_defaultsolo",
  "playlistSettings": {
    "stormSpeed": 1.0,
    "lootMultiplier": 1.0,
    "harvestingMultiplier": 1.0,
    "maxPlayers": 100,
    "respawnEnabled": false,
    "buildingEnabled": true
  }
}
```

---

## Notes

- **Arena playlists** trigger competitive ban checks
- **Boss spawns** are automatic if `enableBosses: true`
- **Storm circles** adjust based on player count
- **Loot pools** are season-specific (C2S2)

---

## Recommended Setup

For Chapter 2 Season 2 authenticity:

1. **Solo**: `playlist_defaultsolo`
2. **Duos**: `playlist_defaultduo`
3. **Squads**: `playlist_defaultsquad`
4. **Arena**: `playlist_showdownalt_solo`
5. **Team Rumble**: `playlist_5x20`

All with `enableBosses: true` for full C2S2 experience!

