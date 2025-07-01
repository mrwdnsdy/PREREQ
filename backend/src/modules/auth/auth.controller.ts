import { Controller, Get, Post, Body, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

class LoginDto {
  email: string;
  password: string;
}

class SignupDto {
  email: string;
  password: string;
  fullName?: string;
}

class ConfirmSignupDto {
  email: string;
  confirmationCode: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ type: LoginDto })
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto.email, loginDto.password);
    } catch (error) {
      throw new HttpException(
        error.message || 'Invalid credentials',
        HttpStatus.UNAUTHORIZED
      );
    }
  }

  @Post('signup')
  @ApiOperation({ summary: 'Sign up with email and password' })
  @ApiBody({ type: SignupDto })
  async signup(@Body() signupDto: SignupDto) {
    try {
      return await this.authService.signup(
        signupDto.email,
        signupDto.password,
        signupDto.fullName
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create account',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('confirm-signup')
  @ApiOperation({ summary: 'Confirm signup with verification code' })
  @ApiBody({ type: ConfirmSignupDto })
  async confirmSignup(@Body() confirmDto: ConfirmSignupDto) {
    try {
      return await this.authService.confirmSignup(
        confirmDto.email,
        confirmDto.confirmationCode
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to confirm signup',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Post('dev-login')
  async devLogin(@Body() body: { email: string }) {
    return this.authService.devLogin(body.email);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile' })
  async getProfile(@CurrentUser() user: any) {
    return user;
  }

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user projects' })
  async getUserProjects(@CurrentUser() user: any) {
    return this.authService.getUserProjects(user.id);
  }
} 