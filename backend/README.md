# Chaindrive Backend

This is the Motoko backend for the Chaindrive ride-sharing application, built on the Internet Computer (IC) blockchain.

## Prerequisites

- [DFINITY Canister SDK (DFX)](https://internetcomputer.org/docs/current/developer-docs/build/install-upgrade-remove/)
- Node.js (v16 or later)

## Setup

1. Install DFX:
   ```bash
   sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local IC network:
   ```bash
   dfx start --clean --background
   ```

4. Deploy the canisters:
   ```bash
   dfx deploy
   ```

## Project Structure

- `ride_backend/` - Main Motoko canister for ride management
  - `main.mo` - Core ride management logic
- `dfx.json` - DFX project configuration
- `package.json` - Node.js project configuration

## Available Methods

### Ride Management

- `createRide(pickupLocation, dropoffLocation, price)` - Create a new ride request
- `getRide(rideId)` - Get ride details by ID
- `getPassengerRides(passengerId)` - Get all rides for a passenger
- `acceptRide(rideId)` - Accept a ride request (for drivers)
- `completeRide(rideId)` - Mark a ride as completed
- `getAvailableRides()` - Get all available rides (for drivers)
- `getDriverRides(driverId)` - Get all rides for a driver

## Development

To regenerate the Candid interface after making changes:

```bash
dfx canister create ride_backend
dfx deploy
```

## Testing

Run the test suite:

```bash
npm test
```

## Deployment

To deploy to the IC mainnet:

1. Make sure you have cycles in your wallet
2. Run:
   ```bash
   dfx deploy --network ic
   ```
