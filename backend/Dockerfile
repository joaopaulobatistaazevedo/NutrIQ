FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -q -DskipTests compile \
    dependency:copy-dependencies \
    -DincludeScope=runtime \
    -DoutputDirectory=target/dependency

FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

COPY --from=build /app/target/classes ./target/classes
COPY --from=build /app/target/dependency ./target/dependency

RUN mkdir -p /app/database

ENV PORT=7071
EXPOSE 7071

CMD ["sh", "-c", "java -cp 'target/classes:target/dependency/*' alnak.Main"]
