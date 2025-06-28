import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { 
  CognitoIdentityProviderClient, 
  GetUserCommand,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  AuthFlowType
} from '@aws-sdk/client-cognito-identity-provider';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private userPoolId: string;
  private clientId: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
    this.userPoolId = process.env.COGNITO_USER_POOL_ID || '';
    this.clientId = process.env.COGNITO_CLIENT_ID || '';
  }

  async login(email: string, password: string) {
    try {
      const command = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const response = await this.cognitoClient.send(command);
      
      if (response.AuthenticationResult?.AccessToken) {
        // Get or create user in database
        const cognitoUser = await this.validateCognitoToken(response.AuthenticationResult.AccessToken);
        
        // Generate our own JWT for API access
        const payload = { 
          sub: cognitoUser.id, 
          email: cognitoUser.email,
          cognitoId: cognitoUser.cognitoId 
        };
        const accessToken = this.jwtService.sign(payload);

        return {
          accessToken,
          user: cognitoUser,
        };
      }

      throw new UnauthorizedException('Login failed');
    } catch (error) {
      console.error('Login error:', error);
      throw new UnauthorizedException(error.message || 'Invalid credentials');
    }
  }

  async signup(email: string, password: string, fullName?: string) {
    try {
      const command = new SignUpCommand({
        ClientId: this.clientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          ...(fullName ? [{ Name: 'name', Value: fullName }] : []),
        ],
      });

      const response = await this.cognitoClient.send(command);

      return {
        userSub: response.UserSub,
        message: 'User created successfully. Please check your email for verification code.',
        codeDeliveryDetails: response.CodeDeliveryDetails,
      };
    } catch (error) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Failed to create account');
    }
  }

  async confirmSignup(email: string, confirmationCode: string) {
    try {
      const command = new ConfirmSignUpCommand({
        ClientId: this.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
      });

      await this.cognitoClient.send(command);

      return {
        message: 'Email confirmed successfully. You can now login.',
      };
    } catch (error) {
      console.error('Confirmation error:', error);
      throw new Error(error.message || 'Failed to confirm email');
    }
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

  async getUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
} 