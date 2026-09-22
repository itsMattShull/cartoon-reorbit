-- CreateEnum
CREATE TYPE "GtoonCardType" AS ENUM ('ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN');

-- CreateEnum
CREATE TYPE "GtoonGroup" AS ENUM ('Bean Scouts', 'Daily Planet', 'G.L.O.B.A.L.', 'Imaginary Friend', 'Injustice Gang', 'Justice Friends', 'Justice League', 'Mucha Lucha', 'Mystery, Inc.', 'Powerpuff Girls', 'Squirrel Scouts', 'Teen Titans', 'Time Squad', 'WOOHP');

-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "gtoonGroup" "GtoonGroup",
ADD COLUMN     "gtoonType1" "GtoonCardType",
ADD COLUMN     "gtoonType2" "GtoonCardType",
ADD COLUMN     "gtoonType3" "GtoonCardType";
