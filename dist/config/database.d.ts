import { Sequelize } from "sequelize";
declare const sequelize: Sequelize;
export default sequelize;
export declare const connectDatabase: () => Promise<void>;
