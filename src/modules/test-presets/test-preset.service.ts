import { Injectable } from '@nestjs/common';
import { TestPresetResponse } from 'models/responses/test-preset/test-preset-response.model';
import {
  TestPresetsEdge,
  TestPresetsResponse,
} from 'models/responses/test-preset/test-presets-response.model';
import { UserResponse } from 'models/responses/user/user-response.model';
import {
  TestContent,
  TestLanguage,
  TestPreset,
  TestType,
} from 'models/test-preset/test-preset.model';
import { AuthProvider, UserBadge } from 'models/user/user.model';
import { PrismaService } from 'nestjs-prisma';
import { CreateTestPresetInput } from 'modules/test-presets/dto/create-test-preset.input';
import { TestPresetsFindInput } from 'modules/test-presets/dto/test-presets-find.input';
import { CopyPresetToUserInput } from './dto/copy-preset-to-user.input';
import { UserTestPresetsInput } from './dto/user-test-presets.input';
import { parsePrismaTestPreset } from './test-preset.helper';

@Injectable()
export class TestPresetService {
  constructor(private prisma: PrismaService) {}

  async presetCreator(creatorId: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: creatorId ?? '' } });

    return {
      user: {
        ...user,
        badge:
          user.badge === 'DEFAULT'
            ? UserBadge.DEFAULT
            : user.badge === 'PRO'
            ? UserBadge.PRO
            : UserBadge.TESTER,
        authProvider:
          user.authProvider === 'DEFAULT'
            ? AuthProvider.DEFAULT
            : user.authProvider === 'DISCORD'
            ? AuthProvider.DISCORD
            : user.authProvider === 'GITHUB'
            ? AuthProvider.GITHUB
            : AuthProvider.GOOGLE,
      },
    };
  }

  async testPreset(id: string): Promise<TestPresetResponse> {
    const preset = await this.prisma.testPreset.findUnique({
      where: { id: id ?? '' },
    });
    return {
      testPreset: parsePrismaTestPreset(preset),
    };
  }

  async testPresetsAll(): Promise<TestPreset[]> {
    const presets = await this.prisma.testPreset.findMany({});

    return presets.map((preset) => parsePrismaTestPreset(preset));
  }

  async testPresets(input: TestPresetsFindInput): Promise<TestPresetsResponse> {
    const presets = await this.prisma.testPreset.findMany({
      take: input.take,
      skip: input.skip,
      where: {
        content: input.where.content,
        id: input.where.id,
        language: input.where.language,
        type: input.where.type,
        words: input.where.words,
        time: input.where.time,
        punctuated: input.where.punctuated,
        userId: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    if (!presets.length) {
      /**
       * this will occur in two (2) scenarios
       *  a) client error, pageInfo was not respected when making request
       *  b) there are no posts matching query
       */
      return {
        count: 0,
        edges: [],
        pageInfo: {
          hasMore: false,
          startCursor: null,
          endCursor: null,
        },
      };
    }

    const hasMore = Boolean(
      await this.prisma.testPreset.count({
        take: 1,
        where: {
          createdAt: { lt: presets[presets.length - 1].createdAt },
        },
      }),
    );

    const edges = presets.map((node) => ({
      cursor: node.createdAt,
      node,
    }));

    const mapped: TestPresetsEdge[] = edges.map((edge) => {
      return {
        cursor: edge.cursor,
        node: parsePrismaTestPreset(edge.node),
      };
    });

    return {
      count: edges.length,
      edges: mapped,
      pageInfo: {
        hasMore,
        startCursor: edges[0].cursor,
        endCursor: edges[edges.length - 1].cursor,
      },
    };
  }

  async userTestPresets(input: UserTestPresetsInput): Promise<TestPresetsResponse> {
    // Fetch presets.
    const presets = await this.prisma.testPreset.findMany({
      take: input.take,
      skip: input.skip,
      where: {
        user: { username: { equals: input.username } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Error handling
    if (!presets.length) {
      return {
        count: 0,
        edges: [],
        pageInfo: {
          hasMore: false,
          startCursor: null,
          endCursor: null,
        },
      };
    }

    // Check if there are more pages
    const hasMore = Boolean(
      await this.prisma.testPreset.count({
        take: 1,
        where: {
          createdAt: { lt: presets[presets.length - 1].createdAt },
        },
      }),
    );

    // Map edges.
    const edges: TestPresetsEdge[] = presets.map((edge) => {
      return {
        cursor: edge.createdAt,
        node: parsePrismaTestPreset(edge),
      };
    });

    // Return
    return {
      count: edges.length,
      edges,
      pageInfo: {
        hasMore,
        startCursor: edges[0].cursor,
        endCursor: edges[edges.length - 1].cursor,
      },
    };
  }

  async copyPresetToUser(input: CopyPresetToUserInput): Promise<TestPresetResponse> {
    try {
      const presetToCopy = await this.prisma.testPreset.findUnique({
        where: { id: input.presetId },
      });
      if (presetToCopy) {
        const newPreset = await this.prisma.testPreset.create({
          data: {
            punctuated: presetToCopy.punctuated,
            words: presetToCopy.words,
            time: presetToCopy.time,
            language: presetToCopy.language,
            content: presetToCopy.content,
            user: { connect: { ...input.user } },
          },
        });

        return {
          testPreset: parsePrismaTestPreset(newPreset),
        };
      } else {
        return {
          errors: [
            {
              field: 'preset',
              message: 'Unable to find preset with the given id',
            },
          ],
        };
      }
    } catch (e) {
      return {
        errors: [
          {
            field: 'unknown',
            message: 'An error occurred',
          },
        ],
      };
    }
  }

  async createTestPreset(data: CreateTestPresetInput): Promise<TestPresetResponse> {
    const preset = await this.prisma.testPreset.create({
      data: {
        type: data.type,
        language: data.language,
        words: data.words,
        time: data.time,
        punctuated: data.punctuated,
        content: data.content,
        creatorImage: 'https://i.imgur.com/xuIzYtW.png',
      },
    });

    return { testPreset: parsePrismaTestPreset(preset) };
  }

  async createTestPresetUser(data: CreateTestPresetInput): Promise<TestPresetResponse> {
    const preset = await this.prisma.testPreset.create({
      data: {
        type: data.type,
        language: data.language,
        words: data.words,
        time: data.time,
        punctuated: data.punctuated,
        content: data.content,
        creatorImage: data.creatorImage,
        user: {
          connect: {
            id: data.userId,
          },
        },
      },
    });
    if (!preset) {
      return {
        errors: [
          {
            field: 'preset',
            message: 'An error occurred while creating preset.',
          },
        ],
      };
    }

    return { testPreset: parsePrismaTestPreset(preset) };
  }
}
