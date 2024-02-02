FROM node:bookworm-slim

# Create the bot's directory
RUN mkdir -p /usr/src/bot

# Set it as the current working directory
WORKDIR /usr/src/bot

# Copy contents of the local source directory to the bot's directory
COPY . /usr/src/bot

# Update npm
RUN npm install --global npm

# Build the bot (installs dependencies and compiles TypeScript)
RUN npm run build

# Run the bot
CMD [ "node", "./dist/src/index.js" ]

# docker build --tag gitfitbot .
# docker run --detach --name gitfitbot-container --env-file ./.env gitfitbot
