# aFLR Viewbox Agent Instructions (Contract Repo)

## Mission
Build a React+Vite 1280×720 broadcast "viewbox" that is controlled via WebSocket messages. This system is a modular render engine for the Ashtabula FrontLine Report (aFLR) automated newscast. It receives JSON commands over a WebSocket connection and uses them to update on-screen elements, play audio, and display video and images.

## Hard Constraints
- **Do not break the message protocol**. All message types and payload shapes must match the definitions in `docs/protocol.md`. Unknown message types must be safely ignored and logged in debug mode.
- **Maintain media path conventions**. Assets like audio, video, images, and marquee files are loaded from stable prefixes under `/media/**` as defined in `docs/protocol.md`.
- **Render at exactly 1280×720 internally**. The viewbox must preserve the original dimensions for proper capture and streaming.
- **No side effects outside of controlled React patterns**. Do not mutate the DOM directly; use React state, refs, and effects.
- **Definition of done**: A task is complete only when all linting, tests, build steps, and the demo show script run without errors. The output must include `<promise>DONE</promise>` at the end only when all tasks meet acceptance criteria.
    - * Must run: npm ci then npm run verify
    - * Only mark complete if CI passes

## Style Guidelines
- Prefer small, composable React components. Separate concerns (audio, video, ticker, overlays) into their own modules.
- Use TypeScript for type safety and define message payload types explicitly.
- Avoid global variables. Use a reducer to manage the overall broadcast state and dispatch actions based on WebSocket messages.
- Use modern React idioms (e.g., hooks) and avoid class components.
- Write tests for reducers and core components. Include an automated demo script to simulate a short broadcast.

## Development Workflow
1. **Bootstrap the project**: Use Vite with a React and TypeScript template to scaffold the codebase.
2. **Define the protocol**: Keep the WebSocket protocol in `docs/protocol.md`. Use Zod or similar for runtime validation.
3. **Implement core**: Create a `WsClientProvider` to handle connections, message dispatching, and reconnection logic. Implement a reducer to update state based on message types.
4. **Build the UI**: Develop the layered viewbox components (`Layer1Audio`, `Layer2BackgroundVideo`, `Layer3Overlays`, `Layer4Dynamic`, `Layer5Overlay`) to match the original design. Use buffers for crossfading video and safe audio handling.
5. **Create a test harness**: Include `scripts/run-demo-show.ts` to drive the viewbox with a sequence of realistic messages. Use this to verify the viewbox contract before shipping.
6. **Ensure resiliency**: Add debug overlays, message logs, and error handling to aid in long-running uptime scenarios.

Refer to the repository's documentation and scripts for more details on development and testing procedures.