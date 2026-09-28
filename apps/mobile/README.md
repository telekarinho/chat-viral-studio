# Post.ai mobile

React Native + TypeScript using Expo Development Build.

## Why development build
The product requires native camera/video capabilities and will use libraries that are not constrained to Expo Go.

## Current state
Foundation shell with the seeded “Hoje” screen for Rodrigo.

## Next implementation
- Expo Router tab shell
- local database
- Supabase auth/session
- Today API
- task state mutations
- reminders
- VisionCamera
- teleprompter overlay
- local-first recording queue

## Run
```bash
npm install
npx expo prebuild
npx expo run:android
```
