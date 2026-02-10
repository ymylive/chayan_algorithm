FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages --no-cache-dir pandas scikit-learn numpy

EXPOSE 3001

CMD ["node", "app.js"]
