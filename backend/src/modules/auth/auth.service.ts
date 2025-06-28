import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }

  async validateCognitoToken(token: string) {
    try {
      const command = new GetUserCommand({
        AccessToken: token,
      });
      
      const response = await this.cognitoClient.send(command);
      
      // Extract user attributes
      const email = response.UserAttributes?.find(attr => attr.Name === 'email')?.Value;
      const cognitoId = response.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
      const fullName = response.UserAttributes?.find(attr => attr.Name === 'name')?.Value;

      if (!email || !cognitoId) {
        throw new UnauthorizedException('Invalid token');
      }

      // Find or create user in database
      let user = await this.prisma.user.findUnique({
        where: { cognitoId },
      });

      if (!user) {
        user = await this.prisma.user.create({
          data: {
            email,
            cognitoId,
            fullName,
          },
        });
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async getUserProjects(userId: string) {
    return this.prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: true,
      },
    });
  }

  async getUserRole(userId: string, projectId: string) {
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    return member?.role || null;
  }

  async hasProjectAccess(userId: string, projectId: string, requiredRole: 'ADMIN' | 'PM' | 'VIEWER' = 'VIEWER') {
    const member = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId,
        },
      },
    });

    if (!member) return false;

    const roleHierarchy = {
      'ADMIN': 3,
      'PM': 2,
      'VIEWER': 1,
    };

    return roleHierarchy[member.role] >= roleHierarchy[requiredRole];
  }
} 