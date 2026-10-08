# Ludo Live — Real-Time Multiplayer

A React/Vite + Node/Socket.IO multiplayer Ludo game.

## Rules implemented

- 2, 3, or 4 players per room.
- Every player has exactly 4 tokens.
- A token starts in its home yard.
- A token can leave the yard only when that player's dice roll is **6**.
- Rolling 6 gives the player another roll after a legal move (or immediately if no legal move exists).
- Tokens follow the classic 52-square outer path and then their 5-square colored home lane before reaching the finish.
- Landing on an opponent's token captures it and sends it back to its yard.
- **Tokens standing on any star/safe square cannot be captured.**
- The board uses the classic layout: green top-left, yellow top-right, red bottom-left, blue bottom-right.
- The dice is displayed beside the Roll Dice button and shows the actual rolled value.
- Game state and dice rolls are authoritative on the Socket.IO server.

## Run locally

From the project root:

```bash
npm install
npm run install:all
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:3001

If you start the processes separately:

```bash
npm run server
npm run client
```

## Room codes and multiplayer networking

Room codes are generated and stored by the Socket.IO server, so all players in the same room receive the same code and game state.

For players on different devices or over the internet, the frontend must point to a **publicly reachable Socket.IO server** using `VITE_SERVER_URL`. `localhost:3001` only works on the same computer running the backend.

For local testing on one computer:
- backend: `http://localhost:3001`
- frontend: `http://localhost:5173`

For deployment, set `VITE_SERVER_URL` in the Vercel frontend project to your deployed Node/Socket.IO server URL and redeploy the frontend.
