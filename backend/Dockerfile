FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN apk add --no-cache python3 py3-pip py3-numpy py3-pandas py3-scikit-learn

EXPOSE 3001

CMD ["node", "app.js"]
