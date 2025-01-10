import axios from 'axios'
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { PackageVersion, NpmDependencies, PackageHandler } from '../types/index.js'

export class NpmHandler implements PackageHandler {
  private registry = 'https://registry.npmjs.org'

  private async getPackageVersion(
    packageName: string,
    currentVersion?: string
  ): Promise<PackageVersion> {
    try {
      const response = await axios.get(
        `${this.registry}/${encodeURIComponent(packageName)}`
      )

      const latestVersion = response.data['dist-tags']?.latest
      if (!latestVersion) {
        throw new Error('Latest version not found')
      }

      const result: PackageVersion = {
        name: packageName,
        latestVersion,
        registry: 'npm',
      }

      if (currentVersion) {
        // Remove any leading ^ or ~ from the current version
        const cleanCurrentVersion = currentVersion.replace(/^[\^~]/, '')
        result.currentVersion = cleanCurrentVersion
      }

      return result
    } catch (error) {
      console.error(`Error fetching npm package ${packageName}:`, error)
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch npm package ${packageName}`
      )
    }
  }

  async getLatestVersion(args: { dependencies: NpmDependencies }) {
    if (!args.dependencies || typeof args.dependencies !== 'object') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Invalid dependencies object'
      )
    }

    const results: PackageVersion[] = []
    for (const [name, version] of Object.entries(args.dependencies)) {
      if (typeof version !== 'string') continue
      try {
        const result = await this.getPackageVersion(name, version)
        results.push(result)
      } catch (error) {
        console.error(`Error checking npm package ${name}:`, error)
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2),
        },
      ],
    }
  }

  async searchPackages(params: { 
    query: string, 
    size?: number,
    quality?: number,
    popularity?: number,
    maintenance?: number
  }) {
    try {
      const searchParams = new URLSearchParams({
        text: params.query,
        size: String(Math.min(params.size || 20, 250))
      })

      if (params.quality !== undefined) {
        searchParams.append('quality', params.quality.toString())
      }
      if (params.popularity !== undefined) {
        searchParams.append('popularity', params.popularity.toString())
      }
      if (params.maintenance !== undefined) {
        searchParams.append('maintenance', params.maintenance.toString())
      }

      const response = await axios.get(
        `https://registry.npmjs.org/-/v1/search?${searchParams}`
      )

      if (response.status !== 200) {
        throw new McpError(
          ErrorCode.InternalError,
          `NPM registry search failed with status ${response.status}`
        )
      }

      const packages = response.data.objects.map((obj: any) => ({
        name: obj.package.name,
        version: obj.package.version,
        description: obj.package.description,
        keywords: obj.package.keywords || [],
        score: obj.score,
        publisher: obj.package.publisher,
        date: obj.package.date,
        links: obj.package.links
      }))

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(packages, null, 2)
          }
        ]
      }
    } catch (error: unknown) {
      if (error instanceof McpError) throw error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to search NPM registry: ${errorMessage}`
      )
    }
  }
}
