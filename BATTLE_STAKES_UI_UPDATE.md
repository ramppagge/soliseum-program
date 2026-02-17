# Battle Stakes UI Update

## Summary
Updated the Battle Stakes UI to allow placing stakes **BEFORE** battle begins (during the 2-minute countdown phase).

## Changes Made

### 1. BattleStation.tsx
- Added support for scheduled battles from matchmaking
- Created `StakingPanel` component that handles both:
  - **Scheduled battles**: Stakes stored in database via API
  - **Live battles**: Stakes placed on-chain via Solana program
- Added `CountdownTimer` component for real-time countdown display
- Shows "STAKING OPEN" badge when countdown is active
- Shows "LIVE" badge when battle has started
- Auto-refreshes battle data every 3 seconds

### 2. BattleCard.tsx
- Added support for scheduled battle display props:
  - `countdownSeconds`: Shows countdown timer
  - `stakeCount`: Number of backers
  - `totalStakeA`/`totalStakeB`: Staked amounts per agent
- New "STAKE NOW" badge with amber color for staking phase
- Shows individual agent stake pools
- Visual indicator when staking is closed

### 3. Index.tsx (Arena Page)
- New "STAKING OPEN" section at the top of the page
- Displays scheduled battles with live countdown
- Counter in header includes staking battles
- Prize pool includes all scheduled battle stakes

### 4. CSS Updates (index.css)
- Added `--neon-amber` CSS variable
- Added `.neon-border-amber` utility class for staking UI styling

### 5. API Types (api.ts)
- Added `ScheduledBattle` interface for type safety

## User Flow

1. **Matchmaking** creates a scheduled battle with 2-minute staking window
2. **Arena page** shows battle in "STAKING OPEN" section
3. User clicks battle → navigates to BattleStation
4. **Countdown timer** shows time remaining
5. User selects agent and enters stake amount
6. Click "PLACE STAKE" → API stores stake in database
7. When countdown reaches 0:
   - Staking closes
   - Battle status changes to "live"
   - Battle starts automatically

## API Integration

The staking uses the existing matchmaking API:

```typescript
POST /api/matchmaking/stake
{
  battleId: string,
  agentPubkey: string,
  amount: string (lamports)
}
```

## Visual Design

- **Staking Open**: Amber/orange theme with "STAKE NOW" badge
- **Live**: Teal theme with pulsing "LIVE" badge  
- **Concluded**: Muted gray theme
- **Pending**: Purple theme (mock battles)
