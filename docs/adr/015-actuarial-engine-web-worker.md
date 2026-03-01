# ADR 015: Actuarial Engine Web Worker Implementation

## Status
Accepted

## Context
The actuarial engine performs Monte Carlo simulations to evaluate policy risk and value. These simulations, especially when running up to 100,000 iterations across multiple policies for comparison, are computationally intensive and can block the browser's main thread for several hundred milliseconds, leading to UI jank or "unresponsive script" warnings.

## Decision
We implemented a dedicated Web Worker (`src/lib/actuarial-engine/actuarial.worker.ts`) to offload the Monte Carlo simulation logic. 

Key implementation details:
- **Asynchronous Execution**: The `engine.ts` provides a `runFullEvaluationAsync` method that delegates the simulation to the worker.
- **Message Passing**: The worker receives the policy data, scenarios, and iteration count, performs the simulation, and returns the aggregated results.
- **Graceful Fallback**: If the browser environment does not support Workers or if the iteration count is low enough (< 1000), the engine can still execute on the main thread.
- **Vite Integration**: Used Vite's built-in worker bundling support.

## Consequences
- **Improved Responsiveness**: The main thread remains free to handle UI interactions and animations during heavy simulations.
- **Multi-threading**: Better utilization of multi-core processors for intensive calculations.
- **Testing Complexity**: Requires vitest to mock the worker environment, which was handled in the test suite.
- **Serialization Overhead**: Minimal overhead for passing JSON-serializable policy data and results between threads.
