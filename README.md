<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

# Orders Microservice

## Dev

1. Clonar el repositorio
2. Instalar las dependencias
3. Crear archivo `.env` basado en el `.env.template`
4. Instalar **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** según la versión de tu sistema operativo
5. Levantar la base de datos postgres

```
docker-compose up -d
docker-compose up (Para revisar los logs)
```

5. Levantar servidor de NATS `docker run -d --name nats-server -p 4222:4222 -p 8222:8222 nats`
6. Ejecutar `yarn start:dev` o `npm run start:dev`

## Stack usado

1. NestJS
2. Prisma
3. PostgreSQL
4. Docker

## Builder

1. swc
