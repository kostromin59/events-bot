FROM node:20 as build
WORKDIR /app
ADD *.json .
RUN npm ci
ADD . .
RUN npx prisma generate
RUN npm run build

FROM node:20
WORKDIR /app
COPY --from=build /app/dist ./dist/
COPY --from=build /app/prisma ./prisma/
COPY --from=build /app/events.json ./events.json
ADD *.json .
RUN npm ci --omit=dev
RUN npx prisma generate
CMD ["npm", "run", "start"]
