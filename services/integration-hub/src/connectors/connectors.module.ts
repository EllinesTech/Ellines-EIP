import { Module } from '@nestjs/common';
import { GraphQLConnector } from './graphql.connector';
import { SoapConnector } from './soap.connector';
import { MongoDBConnector } from './mongodb.connector';
import { KafkaConnector, RabbitMQConnector, MQTTConnector } from './messaging.connector';

@Module({
  providers: [GraphQLConnector, SoapConnector, MongoDBConnector, KafkaConnector, RabbitMQConnector, MQTTConnector],
  exports: [GraphQLConnector, SoapConnector, MongoDBConnector, KafkaConnector, RabbitMQConnector, MQTTConnector],
})
export class ConnectorsModule {}
