FROM node:lts-bullseye-slim

# Create the bot's directory
RUN mkdir -p /usr/src/bot

# Set it as the current working directory
WORKDIR /usr/src/bot

# Copy contents of the local source directory to the bot's directory
COPY . /usr/src/bot

# Build the bot (installs dependencies and compiles TypeScript)
RUN npm run build

# Run the bot
CMD [ "node", "./dist/index.js" ]

# docker build -t gitfitbot .
# docker run --env-file ./.env -v /<absolute_path>/configurations:/usr/src/bot/configurations -d gitfitbot