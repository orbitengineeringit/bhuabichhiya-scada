# Bhua Bicchiya SCADA Monitoring System

A real-time monitoring dashboard for the Bhua Bicchiya Water Supply SCADA system.

## Technologies Used

- **Vite**: Next Generation Frontend Tooling
- **React**: A JavaScript library for building user interfaces
- **TypeScript**: Typed JavaScript at Scale
- **Tailwind CSS**: A utility-first CSS framework
- **shadcn/ui**: Reusable components built with Radix UI and Tailwind CSS
- **Supabase**: Open source Firebase alternative
- **MQTT.js**: MQTT client for the browser

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or bun

### Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   ```

2. Install dependencies:
   ```sh
   npm install
   ```

3. Create a `.env` file in the root directory and add your environment variables (refer to `.env` for required keys).

### Development

Start the development server:
```sh
npm run dev
```

### Build

Build for production:
```sh
npm run build
```

## Project Structure

- `src/components`: UI components
- `src/hooks`: Custom React hooks
- `src/lib`: Utility functions and clients (Supabase, MQTT)
- `src/pages`: Application pages
- `supabase`: Database migrations and functions
